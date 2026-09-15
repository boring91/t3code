#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
release_dir="$repo_root/release"
rust_toolchain="${RUSTUP_TOOLCHAIN:-1.95.0}"
ios_export_method="${T3CODE_IOS_EXPORT_METHOD:-debugging}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This release builder requires macOS." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) desktop_arch="arm64" ;;
  x86_64) desktop_arch="x64" ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

for command_name in git npm plutil shasum tar vp xcodebuild; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

release_version="${T3CODE_RELEASE_VERSION:-${T3CODE_DESKTOP_VERSION:-}}"
if [[ -z "$release_version" ]]; then
  release_version="$(git -C "$repo_root" describe --tags --match 'v*-nightly.*' --abbrev=0 HEAD 2>/dev/null || true)"
  release_version="${release_version#v}"
fi
if [[ -z "$release_version" ]]; then
  release_version="0.0.0-local.$(date -u +%Y%m%d%H%M%S)"
fi

mkdir -p "$release_dir"
staging_dir="$(mktemp -d -t t3code-release)"
trap 'rm -rf -- "$staging_dir"' EXIT

export APP_VARIANT=production
export EXPO_NO_GIT_STATUS=1
export T3CODE_IOS_PERSONAL_TEAM="${T3CODE_IOS_PERSONAL_TEAM:-1}"

# Resolve and validate the Expo configuration before starting either expensive build.
expo_config="$staging_dir/expo-config.json"
vp exec --filter @t3tools/mobile -- expo config --json >"$expo_config"
apple_team_id="${T3CODE_APPLE_TEAM_ID:-$(plutil -extract ios.appleTeamId raw -o - "$expo_config" 2>/dev/null || true)}"
if [[ -z "$apple_team_id" ]]; then
  echo "Set T3CODE_APPLE_TEAM_ID in .env.local or the command environment." >&2
  exit 1
fi
export T3CODE_APPLE_TEAM_ID="$apple_team_id"

echo "Building macOS DMG ($desktop_arch, $release_version)..."
RUSTUP_TOOLCHAIN="$rust_toolchain" \
  T3CODE_DESKTOP_VERSION="$release_version" \
  vp run "dist:desktop:dmg:$desktop_arch"

echo "Generating the iOS project..."
vp exec --filter @t3tools/mobile -- expo prebuild --clean --platform ios

archive_path="$staging_dir/T3Code.xcarchive"
export_dir="$staging_dir/export"
export_options="$staging_dir/ExportOptions.plist"
derived_data="$staging_dir/DerivedData"

plutil -create xml1 "$export_options"
plutil -insert destination -string export "$export_options"
plutil -insert method -string "$ios_export_method" "$export_options"
plutil -insert signingStyle -string automatic "$export_options"
plutil -insert teamID -string "$apple_team_id" "$export_options"

echo "Archiving the Release iOS app..."
xcodebuild \
  -workspace "$repo_root/apps/mobile/ios/T3Code.xcworkspace" \
  -scheme T3Code \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$archive_path" \
  -derivedDataPath "$derived_data" \
  -allowProvisioningUpdates \
  -hideShellScriptEnvironment \
  -quiet \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$apple_team_id" \
  COMPILER_INDEX_STORE_ENABLE=NO \
  archive

echo "Exporting IPA ($ios_export_method)..."
xcodebuild \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$export_dir" \
  -exportOptionsPlist "$export_options" \
  -allowProvisioningUpdates \
  -quiet

shopt -s nullglob
exported_ipas=("$export_dir"/*.ipa)
if [[ ${#exported_ipas[@]} -ne 1 ]]; then
  echo "Expected one exported IPA, found ${#exported_ipas[@]}." >&2
  exit 1
fi

ipa_path="$release_dir/T3-Code-${release_version}-ios.ipa"
cp "${exported_ipas[0]}" "$ipa_path"
dmg_path="$release_dir/T3-Code-${release_version}-${desktop_arch}.dmg"
server_package_path="$release_dir/T3-Code-${release_version}-server.tgz"

echo "Packaging the standalone server..."
node "$repo_root/apps/server/scripts/cli.ts" build \
  --app-version "$release_version" \
  --verbose
official_server_package="$(
  npm pack "@t3code/t3-linux-x64@$release_version" \
    --pack-destination "$staging_dir" \
    --silent 2>/dev/null || true
)"
if [[ -n "$official_server_package" && -f "$staging_dir/$official_server_package" ]]; then
  official_server_dir="$staging_dir/official-server"
  mkdir -p "$official_server_dir"
  tar -xzf "$staging_dir/$official_server_package" -C "$official_server_dir"
  official_resource_monitor_dir="$official_server_dir/package/resource-monitor"
  if [[ ! -d "$official_resource_monitor_dir" ]]; then
    official_resource_monitor_dir="$official_server_dir/package/dist/resource-monitor"
  fi
  if [[ -d "$official_resource_monitor_dir" ]]; then
    mkdir -p "$repo_root/apps/server/dist/resource-monitor"
    cp -R "$official_resource_monitor_dir/." \
      "$repo_root/apps/server/dist/resource-monitor/"
  else
    echo "Warning: the matching upstream platform package has no resource monitors." >&2
  fi
else
  echo "Warning: could not fetch matching upstream resource monitors." >&2
fi
rm -f -- "$server_package_path"
VP_NODE_VERSION=26.8.2 vp exec node "$repo_root/apps/server/scripts/cli.ts" build-exe \
  --app-version "$release_version" \
  --target linux-x64 \
  --verbose
server_archive_dir="$staging_dir/server-archive"
node "$repo_root/scripts/build-cli-archive.ts" \
  --platform linux \
  --arch x64 \
  --version "$release_version" \
  --resource-monitor-dir "$repo_root/apps/server/dist/resource-monitor" \
  --output-dir "$server_archive_dir"
server_archives=("$server_archive_dir"/*.tar.gz)
if [[ ${#server_archives[@]} -ne 1 ]]; then
  echo "Expected one server archive, found ${#server_archives[@]}." >&2
  exit 1
fi
cp "${server_archives[0]}" "$server_package_path"

echo "Release artifacts:"
shasum -a 256 "$dmg_path" "$ipa_path" "$server_package_path"
