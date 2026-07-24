#!/usr/bin/env bash

set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
install_dir=${KI_CLI_INSTALL_DIR:-"$HOME/.local/bin"}
target="$install_dir/ki"
man_source="$script_dir/man/ki.1"
man_install_dir=${KI_MAN_INSTALL_DIR:-"$(dirname -- "$install_dir")/share/man/man1"}
man_target="$man_install_dir/ki.1"
mode=copy

case "${1:-}" in
  ""|--copy) ;;
  --link) mode=link ;;
  -h|--help)
    cat <<'EOF'
Usage: ./install.sh [--copy|--link]

Install `ki` into KI_CLI_INSTALL_DIR (default: ~/.local/bin) and `ki(1)` into
KI_MAN_INSTALL_DIR (default: the corresponding share/man/man1 directory).

--copy  Install the compiled dist/ki executable (the default; run bun run build first).
--link  Install a symbolic link to this checkout's Bun source entry point for local development.
EOF
    exit 0
    ;;
  *) printf 'ki: error: unknown installer option: %s\n' "$1" >&2; exit 2 ;;
esac

[ "$#" -le 1 ] || { printf 'ki: error: installer accepts one option\n' >&2; exit 2; }

if [ -n "${KI_CLI_SOURCE:-}" ]; then
  source_path=$KI_CLI_SOURCE
elif [ "$mode" = link ]; then
  source_path="$script_dir/bin/ki"
else
  source_path="$script_dir/dist/ki"
fi

[ -f "$source_path" ] || { printf 'ki: error: source executable not found: %s\n' "$source_path" >&2; exit 1; }
[ -f "$man_source" ] || { printf 'ki: error: source manual not found: %s\n' "$man_source" >&2; exit 1; }
mkdir -p "$install_dir"
mkdir -p "$man_install_dir"
tmp="$install_dir/.ki.$$"
man_tmp="$man_install_dir/.ki.1.$$"
trap 'rm -f "$tmp" "$man_tmp"' EXIT HUP INT TERM
if [ "$mode" = link ]; then
  ln -s "$source_path" "$tmp"
  ln -s "$man_source" "$man_tmp"
else
  cp "$source_path" "$tmp"
  chmod 755 "$tmp"
  cp "$man_source" "$man_tmp"
fi
"$tmp" --version >/dev/null
mv -f "$tmp" "$target"
mv -f "$man_tmp" "$man_target"
trap - EXIT HUP INT TERM
if [ "$mode" = link ]; then
  printf 'ki: linked %s -> %s\n' "$target" "$source_path"
  printf 'ki: linked %s -> %s\n' "$man_target" "$man_source"
else
  printf 'ki: installed %s\n' "$target"
  printf 'ki: installed %s\n' "$man_target"
fi
case ":${PATH}:" in *":${install_dir}:"*) ;; *) printf 'ki: add %s to PATH to use ki from any directory\n' "$install_dir" ;; esac
