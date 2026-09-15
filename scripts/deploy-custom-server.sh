#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <server-package.tgz>" >&2
  exit 1
fi

package_path="$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
remote_host="${T3CODE_REMOTE_HOST:-boring@100.108.40.121}"
service_name="t3code-custom.service"

if [[ ! -f "$package_path" ]]; then
  echo "Server package not found: $package_path" >&2
  exit 1
fi

archive_root="$(tar -tzf "$package_path" | awk -F/ 'NF > 1 { print $1; exit }')"
if [[ "$archive_root" != t3-*-linux-x64 ]]; then
  echo "Server archive has an unexpected root: $archive_root" >&2
  exit 1
fi
package_version="${archive_root#t3-}"
package_version="${package_version%-linux-x64}"
package_sha256="$(shasum -a 256 "$package_path" | awk '{print $1}')"
package_name="$(basename -- "$package_path")"

if [[ ! "$package_version" =~ ^[0-9A-Za-z._+-]+$ ]]; then
  echo "Invalid package version: $package_version" >&2
  exit 1
fi
if ! tar -tzf "$package_path" | grep -Fx -- "$archive_root/t3" >/dev/null; then
  echo "Server archive has no t3 executable." >&2
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
  "$service_name" <<'REMOTE_SCRIPT'
set -euo pipefail

package_path="$HOME/$1"
expected_sha256="$2"
package_version="$3"
service_name="$4"
install_root="$HOME/.local/share/t3code-custom"
releases_root="$install_root/releases"

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

mkdir -p -- "$releases_root"
release_id="${package_version}-${expected_sha256:0:12}"
release_dir="$releases_root/$release_id"
entry_path="$release_dir/t3"
if [[ ! -f "$entry_path" ]]; then
  release_staging="$(mktemp -d "$releases_root/.install.XXXXXX")"
  trap 'rm -rf -- "$release_staging"' EXIT
  tar -xzf "$package_path" -C "$release_staging"
  shopt -s nullglob dotglob
  archive_roots=("$release_staging"/*)
  shopt -u nullglob dotglob
  if [[ ${#archive_roots[@]} -ne 1 || ! -d "${archive_roots[0]}" ]]; then
    echo "Server archive must contain one root directory." >&2
    exit 1
  fi
  archive_root="${archive_roots[0]}"
  find "$archive_root/resource-monitor" \
    -type f \
    -name t3-resource-monitor \
    -exec chmod 755 {} +
  chmod 755 "$archive_root/t3"
  "$archive_root/t3" --version |
    grep -Fx -- "t3 v$package_version" >/dev/null
  mv -- "$archive_root" "$release_dir"
  rm -rf -- "$release_staging"
  trap - EXIT
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
Environment=PATH=$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$install_root/current/t3 serve
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
  if pair_output="$(timeout 5s "$entry_path" pair 2>&1)"; then
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

if ! pair_output="$(timeout 15s "$entry_path" pair --tailscale 2>&1)"; then
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
