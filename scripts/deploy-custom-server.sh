#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <server-package.tgz>" >&2
  exit 1
fi

package_path="$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
remote_host="${T3CODE_REMOTE_HOST:-boring@100.108.40.121}"
bun_version="${T3CODE_REMOTE_BUN_VERSION:-1.3.3}"
node_version="${T3CODE_REMOTE_NODE_VERSION:-24.13.1}"
service_name="t3code-custom.service"

if [[ ! -f "$package_path" ]]; then
  echo "Server package not found: $package_path" >&2
  exit 1
fi

package_version="$(
  tar -xOf "$package_path" package/package.json |
    node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(value).version))'
)"
package_sha256="$(shasum -a 256 "$package_path" | awk '{print $1}')"
package_name="$(basename -- "$package_path")"

if [[ ! "$package_version" =~ ^[0-9A-Za-z._+-]+$ ]]; then
  echo "Invalid package version: $package_version" >&2
  exit 1
fi

remote_upload_dir=".cache/t3code-custom"
remote_package="$remote_upload_dir/$package_name"

ssh -o BatchMode=yes "$remote_host" "mkdir -p -- '$remote_upload_dir'"
scp -q "$package_path" "$remote_host:$remote_package"

ssh -o BatchMode=yes "$remote_host" bash -s -- \
  "$remote_package" \
  "$package_sha256" \
  "$package_version" \
  "$bun_version" \
  "$node_version" \
  "$service_name" <<'REMOTE_SCRIPT'
set -euo pipefail

package_path="$HOME/$1"
expected_sha256="$2"
package_version="$3"
bun_version="$4"
node_version="$5"
service_name="$6"
install_root="$HOME/.local/share/t3code-custom"
runtime_root="$install_root/runtime"
releases_root="$install_root/releases"
bun_archive="bun-linux-x64.zip"
bun_dir="$runtime_root/bun-v${bun_version}-linux-x64"
bun_bin="$bun_dir/bun"
node_archive="node-v${node_version}-linux-x64.tar.xz"
node_dir="$runtime_root/node-v${node_version}-linux-x64"
node_bin="$node_dir/bin/node"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64) ;;
  *)
    echo "The custom server deploy currently supports Linux x86_64 only." >&2
    exit 1
    ;;
esac

actual_sha256="$(sha256sum "$package_path" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Uploaded server package checksum does not match." >&2
  exit 1
fi

mkdir -p -- "$runtime_root" "$releases_root"
if [[ ! -x "$bun_bin" ]]; then
  runtime_staging="$(mktemp -d "$runtime_root/.install.XXXXXX")"
  trap 'rm -rf -- "$runtime_staging"' EXIT
  curl -fsSLo "$runtime_staging/$bun_archive" \
    "https://github.com/oven-sh/bun/releases/download/bun-v${bun_version}/$bun_archive"
  curl -fsSLo "$runtime_staging/SHASUMS256.txt" \
    "https://github.com/oven-sh/bun/releases/download/bun-v${bun_version}/SHASUMS256.txt"
  expected_bun_sha256="$(awk -v archive="$bun_archive" '$2 == archive { print $1 }' "$runtime_staging/SHASUMS256.txt")"
  actual_bun_sha256="$(sha256sum "$runtime_staging/$bun_archive" | awk '{print $1}')"
  if [[ -z "$expected_bun_sha256" || "$actual_bun_sha256" != "$expected_bun_sha256" ]]; then
    echo "Downloaded Bun runtime checksum does not match." >&2
    exit 1
  fi
  unzip -q "$runtime_staging/$bun_archive" -d "$runtime_staging"
  mkdir -p -- "$bun_dir"
  mv -- "$runtime_staging/bun-linux-x64/bun" "$bun_bin"
  chmod 755 "$bun_bin"
  rm -rf -- "$runtime_staging"
  trap - EXIT
fi
if [[ ! -x "$node_bin" ]]; then
  runtime_staging="$(mktemp -d "$runtime_root/.install.XXXXXX")"
  trap 'rm -rf -- "$runtime_staging"' EXIT
  curl -fsSLo "$runtime_staging/$node_archive" \
    "https://nodejs.org/dist/v${node_version}/$node_archive"
  curl -fsSLo "$runtime_staging/SHASUMS256.txt" \
    "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
  expected_node_sha256="$(awk -v archive="$node_archive" '$2 == archive { print $1 }' "$runtime_staging/SHASUMS256.txt")"
  actual_node_sha256="$(sha256sum "$runtime_staging/$node_archive" | awk '{print $1}')"
  if [[ -z "$expected_node_sha256" || "$actual_node_sha256" != "$expected_node_sha256" ]]; then
    echo "Downloaded Node runtime checksum does not match." >&2
    exit 1
  fi
  tar -xJf "$runtime_staging/$node_archive" -C "$runtime_staging"
  mv -- "$runtime_staging/node-v${node_version}-linux-x64" "$node_dir"
  rm -rf -- "$runtime_staging"
  trap - EXIT
fi
export PATH="$node_dir/bin:$bun_dir:/usr/local/bin:/usr/bin:/bin"

release_id="${package_version}-${expected_sha256:0:12}"
release_dir="$releases_root/$release_id"
entry_path="$release_dir/node_modules/t3/dist/bin.mjs"
if [[ ! -f "$entry_path" ]]; then
  release_staging="$(mktemp -d "$releases_root/.install.XXXXXX")"
  printf '{"private":true}\n' >"$release_staging/package.json"
  (
    cd "$release_staging"
    "$bun_bin" add --ignore-scripts "$package_path"
  )
  find "$release_staging/node_modules/t3/dist/resource-monitor" \
    -type f \
    -name t3-resource-monitor \
    -exec chmod 755 {} +
  "$node_bin" "$release_staging/node_modules/t3/dist/bin.mjs" --version |
    grep -Fx -- "t3 v$package_version" >/dev/null
  mv -- "$release_staging" "$release_dir"
fi

ln -sfn -- "$release_dir" "$install_root/current"

unit_dir="$HOME/.config/systemd/user"
unit_path="$unit_dir/$service_name"
unit_staging="$unit_path.tmp"
mkdir -p -- "$unit_dir"
cat >"$unit_staging" <<UNIT
[Unit]
Description=T3 Code custom headless server
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$HOME
Environment=NODE_ENV=production
Environment=PATH=$node_dir/bin:$bun_dir:/usr/local/bin:/usr/bin:/bin
ExecStart=$node_bin $install_root/current/node_modules/t3/dist/bin.mjs serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
mv -- "$unit_staging" "$unit_path"

systemctl --user daemon-reload
systemctl --user enable "$service_name" >/dev/null
systemctl --user restart "$service_name"

pair_output=""
server_ready=false
for _ in $(seq 1 30); do
  if pair_output="$(timeout 5s "$node_bin" "$entry_path" pair 2>&1)"; then
    server_ready=true
    break
  fi
  sleep 1
done

if [[ "$server_ready" != true ]]; then
  systemctl --user status "$service_name" --no-pager >&2 || true
  journalctl --user -u "$service_name" -n 80 --no-pager >&2 || true
  echo "The custom T3 Code service did not become ready." >&2
  exit 1
fi

tailscale_output=""
if ! tailscale_output="$(
  timeout 15s tailscale serve --bg --https=443 http://127.0.0.1:3773 2>&1
)"; then
  printf '%s\n' "$tailscale_output" >&2
  echo "Tailscale Serve could not publish the custom T3 Code server." >&2
  exit 1
fi

if ! pair_output="$(timeout 15s "$node_bin" "$entry_path" pair --tailscale 2>&1)"; then
  printf '%s\n' "$pair_output" >&2
  echo "The custom T3 Code server is running, but its Tailscale pairing URL is unavailable." >&2
  exit 1
fi

echo "Custom T3 Code server deployed."
echo "Version: $package_version"
echo "Service: $service_name ($(systemctl --user is-active "$service_name"))"
echo "Tailscale: $(tailscale ip -4)"
echo "Linger: $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown)"
printf '%s\n' "$pair_output"
REMOTE_SCRIPT
