#!/usr/bin/env bash

set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_path=${KI_CLI_SOURCE:-"$script_dir/bin/ki"}
install_dir=${KI_CLI_INSTALL_DIR:-"$HOME/.local/bin"}
target="$install_dir/ki"

[ -f "$source_path" ] || { printf 'ki: error: source executable not found: %s\n' "$source_path" >&2; exit 1; }
mkdir -p "$install_dir"
tmp="$install_dir/.ki.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
cp "$source_path" "$tmp"
chmod 755 "$tmp"
"$tmp" --version >/dev/null
mv -f "$tmp" "$target"
trap - EXIT HUP INT TERM
printf 'ki: installed %s\n' "$target"
case ":${PATH}:" in *":${install_dir}:"*) ;; *) printf 'ki: add %s to PATH to use ki from any directory\n' "$install_dir" ;; esac
