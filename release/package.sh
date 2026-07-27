#!/usr/bin/env bash

set -euo pipefail

version=${1:?usage: release/package.sh <version> <target> <asset-target>}
target=${2:?usage: release/package.sh <version> <target> <asset-target>}
asset_target=${3:?usage: release/package.sh <version> <target> <asset-target>}
case "$version" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) printf 'ki release: version must be a v-prefixed semantic version\n' >&2; exit 2 ;;
esac

case "$asset_target" in
  darwin-arm64|darwin-x64|linux-x64) ;;
  *) printf 'ki release: unsupported asset target: %s\n' "$asset_target" >&2; exit 2 ;;
esac

asset="ki-${version}-${asset_target}.tar.gz"
stage="dist/release/${asset_target}"
rm -rf "$stage"
mkdir -p "$stage/man"
bun build --compile --target="$target" --outfile "$stage/ki" src/main.ts
cp man/ki.1 "$stage/man/ki.1"
tar -C "$stage" -czf "dist/$asset" ki man/ki.1
tar -tzf "dist/$asset" | sort | diff -u <(printf 'ki\nman/ki.1\n') -
