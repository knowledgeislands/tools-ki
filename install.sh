#!/usr/bin/env bash

# Install a signed, immutable KI release.  `--link` is deliberately a separate
# local-development mode: it never downloads or verifies a release.
set -euo pipefail

readonly release_owner='knowledgeislands'
readonly release_repository='tools-ki'
readonly default_release_base="https://github.com/${release_owner}/${release_repository}"

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
install_dir=${KI_CLI_INSTALL_DIR:-"$HOME/.local/bin"}
man_install_dir=${KI_MAN_INSTALL_DIR:-"$(dirname -- "$install_dir")/share/man/man1"}
target="$install_dir/ki"
man_target="$man_install_dir/ki.1"
mode=release
requested_version=''
stage=''
openssl_bin=${KI_OPENSSL:-openssl}

die() {
  printf 'ki: error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./install.sh [vX.Y.Z]
       ./install.sh --link

Install the latest verified KI release, or the exact v-prefixed semantic version
requested.  Release archives, their canonical checksum manifest, and the
manifest's Ed25519 signature are verified before any installed file is changed.

--link  Install a local-development launcher which runs this checkout's
        src/main.ts with Bun.  It does not install a release.
EOF
}

cleanup() {
  if [ -n "$stage" ] && [ -d "$stage" ]; then
    rm -rf "$stage"
  fi
}

trap cleanup EXIT HUP INT TERM

if [ "$#" -gt 1 ]; then
  printf 'ki: error: installer accepts one argument\n' >&2
  exit 2
fi

case "${1:-}" in
  '') ;;
  --link) mode=link ;;
  -h|--help) usage; exit 0 ;;
  v*) requested_version=$1 ;;
  *) printf 'ki: error: expected an exact version such as v1.2.3, or --link\n' >&2; exit 2 ;;
esac

is_exact_version() {
  printf '%s\n' "$1" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

supports_ed25519_rawin() {
  "$1" pkeyutl -help 2>&1 | grep -q -- '-rawin'
}

select_openssl() {
  if supports_ed25519_rawin "$openssl_bin"; then return; fi
  if [ -z "${KI_OPENSSL:-}" ] && command -v brew >/dev/null 2>&1; then
    homebrew_openssl="$(brew --prefix openssl@3 2>/dev/null)/bin/openssl"
    if [ -x "$homebrew_openssl" ] && supports_ed25519_rawin "$homebrew_openssl"; then
      openssl_bin=$homebrew_openssl
      return
    fi
  fi
  die 'OpenSSL with Ed25519 -rawin support is required; install openssl@3 or set KI_OPENSSL'
}

verify_manifest_signature() {
  public_key=$1
  manifest=$2
  signature=$3

  "$openssl_bin" pkeyutl -verify -rawin -pubin -inkey "$public_key" -in "$manifest" -sigfile "$signature" >/dev/null 2>&1
}

replace_file() {
  replacement=$1
  destination=$2
  backup=$3
  backup_marker=$4
  placed_marker=$5

  if [ -e "$destination" ] || [ -L "$destination" ]; then
    mv "$destination" "$backup"
    printf 'yes\n' >"$backup_marker"
  fi
  mv "$replacement" "$destination"
  printf 'yes\n' >"$placed_marker"
}

rollback_file() {
  destination=$1
  backup=$2
  backup_marker=$3
  placed_marker=$4

  if [ -f "$backup_marker" ]; then
    rm -f "$destination"
    mv "$backup" "$destination"
  elif [ -f "$placed_marker" ]; then
    rm -f "$destination"
  fi
}

install_link() {
  require_command bun
  source_entry="$script_dir/src/main.ts"
  man_source="$script_dir/man/ki.1"
  [ -f "$source_entry" ] || die "local source entry not found: $source_entry"
  [ -f "$man_source" ] || die "local manual not found: $man_source"

  mkdir -p "$install_dir" "$man_install_dir"
  stage=$(mktemp -d "${TMPDIR:-/tmp}/ki-install.XXXXXX") || die 'could not create staging directory'
  runner="$install_dir/.ki-local-runner"
  {
    printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail'
    printf 'exec bun %q "$@"\n' "$source_entry"
  } >"$runner"
  chmod 755 "$runner"
  ln -s "$runner" "$stage/ki"
  ln -s "$man_source" "$stage/ki.1"

  install_pair "$stage/ki" "$stage/ki.1"
  printf 'ki: linked %s to local Bun source %s\n' "$target" "$source_entry"
  printf 'ki: linked %s -> %s\n' "$man_target" "$man_source"
}

release_base() {
  if [ -n "${KI_INSTALL_TEST_BASE_URL:-}" ] && [ "${KI_INSTALL_TEST_MODE:-}" != '1' ]; then
    die 'KI_INSTALL_TEST_BASE_URL is available only with KI_INSTALL_TEST_MODE=1'
  fi
  if [ "${KI_INSTALL_TEST_MODE:-}" = '1' ]; then
    [ -n "${KI_INSTALL_TEST_BASE_URL:-}" ] || die 'KI_INSTALL_TEST_MODE=1 requires KI_INSTALL_TEST_BASE_URL'
    [ -n "${KI_INSTALL_TEST_PUBLIC_KEY:-}" ] || die 'KI_INSTALL_TEST_MODE=1 requires KI_INSTALL_TEST_PUBLIC_KEY'
    printf '%s\n' "${KI_INSTALL_TEST_BASE_URL%/}"
  else
    printf '%s\n' "$default_release_base"
  fi
}

download() {
  url=$1
  output=$2
  case "$url" in
    https://*) curl --fail --silent --show-error --location --max-redirs 3 --proto '=https' --proto-redir '=https' --output "$output" "$url" || die "could not download $url" ;;
    http://127.0.0.1:*|http://localhost:*)
      [ "${KI_INSTALL_TEST_MODE:-}" = '1' ] || die 'refusing a non-HTTPS download'
      curl --fail --silent --show-error --location --max-redirs 3 --output "$output" "$url" || die "could not download $url"
      ;;
    *) die 'refusing a non-HTTPS download' ;;
  esac
}

discover_latest_version() {
  base=$1
  case "$base" in
    https://*) final_url=$(curl --fail --silent --show-error --location --max-redirs 3 --proto '=https' --proto-redir '=https' --output /dev/null --write-out '%{url_effective}' "$base/releases/latest") || die 'could not resolve latest release' ;;
    http://127.0.0.1:*|http://localhost:*)
      [ "${KI_INSTALL_TEST_MODE:-}" = '1' ] || die 'refusing a non-HTTPS release lookup'
      final_url=$(curl --fail --silent --show-error --location --max-redirs 3 --output /dev/null --write-out '%{url_effective}' "$base/releases/latest") || die 'could not resolve latest release'
      ;;
    *) die 'refusing a non-HTTPS release lookup' ;;
  esac
  latest=${final_url##*/releases/tag/}
  [ "$latest" != "$final_url" ] && is_exact_version "$latest" || die 'latest release did not resolve to an exact semantic version'
  printf '%s\n' "$latest"
}

detect_target() {
  system=$(uname -s)
  machine=$(uname -m)
  if [ "${KI_INSTALL_TEST_MODE:-}" = '1' ]; then
    system=${KI_INSTALL_TEST_UNAME_S:-$system}
    machine=${KI_INSTALL_TEST_UNAME_M:-$machine}
  fi
  case "$system/$machine" in
    Darwin/arm64|Darwin/aarch64) printf '%s\n' darwin-arm64 ;;
    Darwin/x86_64) printf '%s\n' darwin-x64 ;;
    Linux/x86_64|Linux/amd64) printf '%s\n' linux-x64 ;;
    *) die "unsupported platform: $system/$machine (supported: darwin-arm64, darwin-x64, linux-x64)" ;;
  esac
}

validate_manifest() {
  manifest=$1
  version=$2
  asset=$3
  LC_ALL=C grep -q "$(printf '\r')" "$manifest" && die 'release manifest must use LF line endings'
  [ "$(tail -c 1 "$manifest" | od -An -t x1 | tr -d '[:space:]')" = '0a' ] || die 'release manifest must end with LF'
  expected_hash=$(awk -v version="$version" -v asset="$asset" '
    NR == 1 { if ($0 != "format=ki-release-checksums-v1") exit 1; next }
    NR == 2 { if ($0 != "version=" version) exit 1; next }
    NR >= 3 && NR <= 5 {
      if ($0 !~ /^[0-9a-f]{64}  ki-v[0-9]+\.[0-9]+\.[0-9]+-(darwin-arm64|darwin-x64|linux-x64)\.tar\.gz$/) exit 1
      hash = substr($0, 1, 64)
      filename = substr($0, 67)
      if (index(filename, "ki-" version "-") != 1) exit 1
      if (last_filename != "" && last_filename >= filename) exit 1
      last_filename = filename
      archive_target = filename
      sub("^ki-" version "-", "", archive_target)
      sub("\\.tar\\.gz$", "", archive_target)
      if (seen[archive_target]++) exit 1
      if (filename == asset) { if (found) exit 1; found = 1; print hash }
      next
    }
    { exit 1 }
    END { if (NR != 5 || !found || !seen["darwin-arm64"] || !seen["darwin-x64"] || !seen["linux-x64"]) exit 1 }
  ' "$manifest") || die 'release manifest is malformed or does not describe this asset'
  [ -n "$expected_hash" ] || die 'release manifest is malformed or does not describe this asset'
  printf '%s\n' "$expected_hash"
}

verify_archive_shape() {
  archive=$1
  members=$(tar -tzf "$archive") || die 'release archive could not be read'
  [ "$members" = "$(printf 'ki\nman/ki.1')" ] || die 'release archive must contain exactly ki and man/ki.1'
  tar -tvzf "$archive" | awk '
    NR == 1 { if (substr($0, 1, 1) != "-" || $NF != "ki") exit 1; next }
    NR == 2 { if (substr($0, 1, 1) != "-" || $NF != "man/ki.1") exit 1; next }
    { exit 1 }
    END { if (NR != 2) exit 1 }
  ' || die 'release archive contains a non-regular member'
}

install_pair() {
  staged_ki=$1
  staged_man=$2
  mkdir -p "$install_dir" "$man_install_dir"
  new_ki="$install_dir/.ki.new.$$"
  new_man="$man_install_dir/.ki.1.new.$$"
  backup_ki="$install_dir/.ki.old.$$"
  backup_man="$man_install_dir/.ki.1.old.$$"
  marker_ki="$stage/replaced-ki"
  marker_man="$stage/replaced-man"
  placed_ki="$stage/placed-ki"
  placed_man="$stage/placed-man"
  rm -f "$new_ki" "$new_man" "$backup_ki" "$backup_man"
  cp -P "$staged_ki" "$new_ki"
  chmod 755 "$new_ki"
  cp -P "$staged_man" "$new_man"

  if ! replace_file "$new_ki" "$target" "$backup_ki" "$marker_ki" "$placed_ki"; then
    rollback_file "$target" "$backup_ki" "$marker_ki" "$placed_ki"
    rm -f "$new_ki" "$new_man"
    die 'could not replace installed executable'
  fi
  if [ "${KI_INSTALL_TEST_MODE:-}" = '1' ] && [ "${KI_INSTALL_TEST_FAIL_MAN_REPLACE:-}" = '1' ]; then
    replacement_failed=yes
  elif replace_file "$new_man" "$man_target" "$backup_man" "$marker_man" "$placed_man"; then
    rm -f "$backup_ki" "$backup_man"
    return
  else
    replacement_failed=yes
  fi

  rollback_file "$target" "$backup_ki" "$marker_ki" "$placed_ki"
  rollback_file "$man_target" "$backup_man" "$marker_man" "$placed_man"
  rm -f "$new_ki" "$new_man"
  die 'could not replace installed manual; restored previous installation'
}

install_release() {
  require_command curl
  require_command shasum
  require_command tar
  require_command awk
  require_command od
  select_openssl

  base=$(release_base)
  version=$requested_version
  if [ -z "$version" ]; then version=$(discover_latest_version "$base"); fi
  is_exact_version "$version" || die 'version must be an exact v-prefixed semantic version'
  target_name=$(detect_target)
  asset="ki-${version}-${target_name}.tar.gz"
  stage=$(mktemp -d "${TMPDIR:-/tmp}/ki-install.XXXXXX") || die 'could not create staging directory'
  manifest="$stage/ki-checksums.txt"
  signature="$stage/ki-checksums.txt.sig"
  archive="$stage/$asset"
  public_key="$script_dir/release/ki-release-signing-public.pem"
  if [ "${KI_INSTALL_TEST_MODE:-}" = '1' ]; then public_key=$KI_INSTALL_TEST_PUBLIC_KEY; fi
  [ -f "$public_key" ] || die "release signing public key not found: $public_key"

  download "$base/releases/download/$version/ki-checksums.txt" "$manifest"
  download "$base/releases/download/$version/ki-checksums.txt.sig" "$signature"
  verify_manifest_signature "$public_key" "$manifest" "$signature" || die 'release manifest signature could not be verified'
  expected_hash=$(validate_manifest "$manifest" "$version" "$asset")
  download "$base/releases/download/$version/$asset" "$archive"
  actual_hash=$(shasum -a 256 "$archive" | awk '{print $1}')
  [ "$actual_hash" = "$expected_hash" ] || die 'release archive checksum does not match the verified manifest'
  verify_archive_shape "$archive"
  extract="$stage/extract"
  mkdir "$extract"
  tar -xzf "$archive" -C "$extract" || die 'release archive could not be extracted'
  [ -f "$extract/ki" ] && [ ! -L "$extract/ki" ] && [ -f "$extract/man/ki.1" ] && [ ! -L "$extract/man/ki.1" ] || die 'release archive did not extract regular files'
  [ -x "$extract/ki" ] || die 'release executable is not executable'
  [ "$("$extract/ki" --version)" = "${version#v}" ] || die "release executable does not report $version"
  install_pair "$extract/ki" "$extract/man/ki.1"
  printf 'ki: installed verified release %s (%s) at %s\n' "$version" "$target_name" "$target"
  printf 'ki: installed %s\n' "$man_target"
}

if [ "$mode" = link ]; then
  install_link
else
  install_release
fi

case ":${PATH}:" in
  *":${install_dir}:"*) ;;
  *) printf 'ki: add %s to PATH to use ki from any directory\n' "$install_dir" ;;
esac
