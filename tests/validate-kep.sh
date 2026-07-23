#!/usr/bin/env bash

set -eu

validation_error() {
  printf 'KEP validation error: %s\n' "$1" >&2
  exit 1
}

physical_directory() {
  [ -d "$1" ] || return 1
  (CDPATH='' cd -P -- "$1" && pwd)
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    validation_error "a SHA-256 utility is required (shasum or sha256sum)"
  fi
}

valid_relative_path() {
  case "$1" in
    "" | /* | *//* | . | .. | ./* | ../* | */./* | */../*) return 1 ;;
  esac
  [[ "$1" =~ ^[A-Za-z0-9._/-]+$ ]]
}

manifest_value() {
  awk -F ' = ' -v key="$2" '$1 == key { print $2; found = 1 } END { exit !found }' "$1"
}

count_files() {
  (
    CDPATH='' cd -- "$1"
    find . -type f -print | awk 'END { print NR }'
  )
}

count_lines() {
  awk 'END { print NR }' "$1"
}

[ "$#" -eq 1 ] || validation_error "usage: validate-kep.sh <kep-directory>"
[ ! -L "$1" ] || validation_error "KEP directory must not be a symbolic link"
KEP_DIRECTORY=$(physical_directory "$1") || validation_error "KEP directory must exist"

for required in kep.toml checksums/sha256sums.txt relationships/native.jsonl source/originals source/records; do
  [ -e "$KEP_DIRECTORY/$required" ] && [ ! -L "$KEP_DIRECTORY/$required" ] || validation_error "missing required path: $required"
done
[ ! -e "$KEP_DIRECTORY/assets" ] || { [ -d "$KEP_DIRECTORY/assets" ] && [ ! -L "$KEP_DIRECTORY/assets" ]; } || validation_error "assets must be a directory when present"

format=$(manifest_value "$KEP_DIRECTORY/kep.toml" format)
format_version=$(manifest_value "$KEP_DIRECTORY/kep.toml" format_version)
package_id=$(manifest_value "$KEP_DIRECTORY/kep.toml" package_id)
payload_sha256=$(manifest_value "$KEP_DIRECTORY/kep.toml" payload_sha256)
checksum_manifest=$(manifest_value "$KEP_DIRECTORY/kep.toml" checksum_manifest)
[ "$format" = '"kep"' ] || validation_error "format must be kep"
[ "$format_version" = '"0.1.0"' ] || validation_error "format_version must be 0.1.0"
[ "$checksum_manifest" = '"checksums/sha256sums.txt"' ] || validation_error "checksum_manifest is invalid"

checksum_file="$KEP_DIRECTORY/checksums/sha256sums.txt"
paths=""
while IFS='  ' read -r digest path; do
  [[ "$digest" =~ ^[a-f0-9]{64}$ ]] || validation_error "checksum digest is invalid"
  valid_relative_path "$path" || validation_error "checksum path is unsafe"
  case "$path" in kep.toml|checksums/sha256sums.txt) validation_error "checksum manifest lists an excluded path" ;; esac
  [ -f "$KEP_DIRECTORY/$path" ] && [ ! -L "$KEP_DIRECTORY/$path" ] || validation_error "checksum path is absent: $path"
  [ "$(sha256_file "$KEP_DIRECTORY/$path")" = "$digest" ] || validation_error "checksum mismatch: $path"
  if [ -z "$paths" ]; then
    paths="$path"
  else
    paths="${paths}
$path"
  fi
done < "$checksum_file"

[ -n "$paths" ] || validation_error "checksum manifest is empty"
[ "$(printf '%s\n' "$paths" | LC_ALL=C sort)" = "$paths" ] || validation_error "checksum paths are not in lexicographic order"
[ "$(printf '%s\n' "$paths" | LC_ALL=C sort | uniq | wc -l | awk '{print $1}')" = "$(printf '%s\n' "$paths" | awk 'END { print NR }')" ] || validation_error "checksum manifest repeats a path"

actual_paths=$( (
  CDPATH='' cd -- "$KEP_DIRECTORY"
  find . -type f ! -path './kep.toml' ! -path './checksums/sha256sums.txt' -print | sed 's|^\./||' | LC_ALL=C sort
) )
[ "$actual_paths" = "$paths" ] || validation_error "checksum manifest does not cover the payload"

calculated_payload=$(sha256_file "$checksum_file")
[ "$payload_sha256" = "\"$calculated_payload\"" ] || validation_error "payload_sha256 is invalid"
[ "$package_id" = "\"kep:sha256:$calculated_payload\"" ] || validation_error "package_id is invalid"

records=$(count_files "$KEP_DIRECTORY/source/records")
if [ -d "$KEP_DIRECTORY/assets" ]; then
  assets=$(count_files "$KEP_DIRECTORY/assets")
else
  assets=0
fi
relationships=$(count_lines "$KEP_DIRECTORY/relationships/native.jsonl")
[ "$(manifest_value "$KEP_DIRECTORY/kep.toml" records)" = "$records" ] || validation_error "record inventory is invalid"
[ "$(manifest_value "$KEP_DIRECTORY/kep.toml" assets)" = "$assets" ] || validation_error "asset inventory is invalid"
[ "$(manifest_value "$KEP_DIRECTORY/kep.toml" relationships)" = "$relationships" ] || validation_error "relationship inventory is invalid"

order_pattern='^\{"type":"conversation-order","record":"source/records/[A-Za-z0-9._/-]+","position":[1-9][0-9]*\}$'
asset_pattern='^\{"type":"message-asset","record":"source/records/[A-Za-z0-9._/-]+","asset":"assets/[A-Za-z0-9._/-]+","message_id":"[A-Za-z0-9._:-]+"\}$'
project_pattern='^\{"type":"project-conversation","record":"source/records/[A-Za-z0-9._/-]+","project_id":"[A-Za-z0-9._:-]+"\}$'
while IFS= read -r relationship || [ -n "$relationship" ]; do
  [[ "$relationship" =~ $order_pattern || "$relationship" =~ $asset_pattern || "$relationship" =~ $project_pattern ]] || validation_error "relationship JSON is invalid"
done < "$KEP_DIRECTORY/relationships/native.jsonl"

printf 'KEP valid: %s\n' "$KEP_DIRECTORY"
