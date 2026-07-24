#!/usr/bin/env bash

set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_path=${KI_CLI_SOURCE:-"$script_dir/bin/ki"}
install_dir=${KI_CLI_INSTALL_DIR:-"$HOME/.local/bin"}
target="$install_dir/ki"
mode=copy

case "${1:-}" in
  ""|--copy) ;;
  --link) mode=link ;;
  -h|--help)
    cat <<'EOF'
Usage: ./install.sh [--copy|--link]

Install `ki` into KI_CLI_INSTALL_DIR (default: ~/.local/bin).

--copy  Install a regular executable copy (the default).
--link  Install a symbolic link to this checkout for local development.
EOF
    exit 0
    ;;
  *) printf 'ki: error: unknown installer option: %s\n' "$1" >&2; exit 2 ;;
esac

[ "$#" -le 1 ] || { printf 'ki: error: installer accepts one option\n' >&2; exit 2; }

[ -f "$source_path" ] || { printf 'ki: error: source executable not found: %s\n' "$source_path" >&2; exit 1; }
mkdir -p "$install_dir"
tmp="$install_dir/.ki.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
if [ "$mode" = link ]; then
  ln -s "$source_path" "$tmp"
else
  cp "$source_path" "$tmp"
  chmod 755 "$tmp"
fi
"$tmp" --version >/dev/null
mv -f "$tmp" "$target"
trap - EXIT HUP INT TERM
if [ "$mode" = link ]; then
  printf 'ki: linked %s -> %s\n' "$target" "$source_path"
else
  printf 'ki: installed %s\n' "$target"
fi
case ":${PATH}:" in *":${install_dir}:"*) ;; *) printf 'ki: add %s to PATH to use ki from any directory\n' "$install_dir" ;; esac
