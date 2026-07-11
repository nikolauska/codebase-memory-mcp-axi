#!/usr/bin/env bash
set -euo pipefail

data_dir="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-${CBM_AXI_DATA_DIR:-}}}"
install_dir="${CBM_AXI_INSTALL_DIR:-}"
if [ -z "$install_dir" ] && [ -n "$data_dir" ]; then
  install_dir="$data_dir/bin"
fi
install_dir="${install_dir:-${GOBIN:-$HOME/.local/bin}}"
version="${CBM_AXI_VERSION:-latest}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

die() {
  echo "error: $*" >&2
  exit 1
}

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    die "curl or wget is required"
  fi
}

checksum() {
  local checksums="$1" file="$2" path="$3" expected actual
  expected="$(awk -v file="$file" '
    { name = $2; sub(/^.*\//, "", name); if (name == file) { print $1; exit } }
  ' "$checksums")"
  [ -n "$expected" ] || die "checksum missing for $file"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$path" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$path" | awk '{print $1}')"
  else
    die "sha256sum or shasum is required"
  fi
  [ "$expected" = "$actual" ] || die "checksum mismatch for $file"
}

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) die "unsupported operating system: $(uname -s)" ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=amd64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

mkdir -p "$install_dir"

if ! command -v codebase-memory-mcp >/dev/null 2>&1; then
  upstream="$tmp_dir/codebase-memory-mcp-install.sh"
  download "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh" "$upstream"
  bash "$upstream" --dir "$install_dir" --skip-config
fi

if [ "$version" = "latest" ]; then
  base_url="https://github.com/nikolauska/codebase-memory-mcp-axi/releases/latest/download"
else
  base_url="https://github.com/nikolauska/codebase-memory-mcp-axi/releases/download/$version"
fi

asset="cbm-axi-$os-$arch"
binary="$tmp_dir/$asset"
download "$base_url/$asset" "$binary"
checksums="$tmp_dir/checksums.txt"
download "$base_url/checksums.txt" "$checksums"
checksum "$checksums" "$asset" "$binary"
install -m 0755 "$binary" "$install_dir/cbm-axi"

echo "Installed cbm-axi and codebase-memory-mcp to $install_dir"
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "Add $install_dir to PATH before using cbm-axi." ;;
esac
echo "Optional user hook setup: cbm-axi setup"
