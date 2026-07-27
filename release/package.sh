#!/usr/bin/env bash

set -euo pipefail

version=${1:?usage: release/package.sh <version> <target> <asset-target>}
target=${2:?usage: release/package.sh <version> <target> <asset-target>}
asset_target=${3:?usage: release/package.sh <version> <target> <asset-target>}

if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'ki release: version must be an exact v-prefixed semantic version\n' >&2
  exit 2
fi

case "$asset_target" in
  darwin-arm64|darwin-x64|linux-x64) ;;
  *) printf 'ki release: unsupported asset target: %s\n' "$asset_target" >&2; exit 2 ;;
esac

case "$target:$asset_target" in
  bun-darwin-arm64:darwin-arm64|bun-darwin-x64:darwin-x64|bun-linux-x64:linux-x64) ;;
  *) printf 'ki release: target does not match asset target: %s\n' "$asset_target" >&2; exit 2 ;;
esac

asset="ki-${version}-${asset_target}.tar.gz"
stage="dist/release/${asset_target}"
archive="dist/${asset}"
rm -rf "$stage"
mkdir -p "$stage/man"
bun build --compile --target="$target" --outfile "$stage/ki" src/main.ts
cp man/ki.1 "$stage/man/ki.1"
tar -C "$stage" -czf "$archive" ki man/ki.1

entries=$(tar -tzf "$archive")
if [[ "$entries" != $'ki\nman/ki.1' ]]; then
  printf 'ki release: archive must contain only ki and man/ki.1\n' >&2
  exit 1
fi

for entry in ki man/ki.1; do
  type=$(tar -tvzf "$archive" "$entry" | awk '{print substr($1, 1, 1)}')
  if [[ "$type" != '-' ]]; then
    printf 'ki release: archive entry must be a regular file: %s\n' "$entry" >&2
    exit 1
  fi
done
