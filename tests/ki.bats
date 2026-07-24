#!/usr/bin/env bats

KI="$BATS_TEST_DIRNAME/../bin/ki"
VALIDATOR="$BATS_TEST_DIRNAME/validate-kep.sh"

make_capture() {
  local capture="$1"

  mkdir -p "$capture/originals" "$capture/records" "$capture/assets" "$capture/relationships"
  cat > "$capture/capture.toml" <<'EOF'
format = "ki-chatgpt-capture"
format_version = "0.1.0"
capture_boundary = "One exported conversation: cli-002"
omissions = ["No project membership was available"]
EOF
  printf '%s\n' '{"conversation_id":"cli-002"}' > "$capture/originals/export.json"
  cat > "$capture/records/conversation.md" <<'EOF'
# CLI-002 conversation

user: Please preserve this source record.
assistant: The record is preserved without extracting knowledge.
EOF
  printf '\211PNG\r\n' > "$capture/assets/example.png"
  cat > "$capture/relationships/native.jsonl" <<'EOF'
{"type":"conversation-order","record":"records/conversation.md","position":1}
{"type":"message-asset","record":"records/conversation.md","asset":"assets/example.png","message_id":"message-001"}
EOF
}

@test "root help, completion, and doctor expose the released surface" {
  run "$KI" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"acquire"* ]]
  [[ "$output" == *"paths"* ]]

  run "$KI" completion bash
  [ "$status" -eq 0 ]
  [[ "$output" == *"acquire"* ]]

  run "$KI" completions zsh
  [ "$status" -eq 0 ]
  [[ "$output" == *"#compdef ki"* ]]

  run "$KI" doctor
  [ "$status" -eq 0 ]
  [[ "$output" == *"ki version: 0.2.0"* ]]
  [[ "$output" == *"installation: regular executable"* ]]
}

@test "paths resolves XDG defaults and explicit overrides without writing" {
  home="$BATS_TEST_TMPDIR/home"

  run env HOME="$home" "$KI" paths
  [ "$status" -eq 0 ]
  [[ "$output" == *"data: $home/.local/share/ki"* ]]
  [[ "$output" == *"config: $home/.config/ki"* ]]
  [ ! -e "$home" ]

  run env XDG_DATA_HOME="$BATS_TEST_TMPDIR/data" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/config" XDG_CACHE_HOME="$BATS_TEST_TMPDIR/cache" XDG_STATE_HOME="$BATS_TEST_TMPDIR/state" "$KI" paths
  [ "$status" -eq 0 ]
  [[ "$output" == *"data: $BATS_TEST_TMPDIR/data/ki"* ]]
  [[ "$output" == *"config: $BATS_TEST_TMPDIR/config/ki"* ]]
  [[ "$output" == *"cache: $BATS_TEST_TMPDIR/cache/ki"* ]]
  [[ "$output" == *"state: $BATS_TEST_TMPDIR/state/ki"* ]]
}

@test "the installer can link a development checkout without changing its version" {
  install_dir="$BATS_TEST_TMPDIR/dev/bin"

  run env KI_CLI_INSTALL_DIR="$install_dir" "$BATS_TEST_DIRNAME/../install.sh" --link
  [ "$status" -eq 0 ]
  [[ "$output" == *"ki: linked"* ]]
  [ -L "$install_dir/ki" ]

  run "$install_dir/ki" doctor
  [ "$status" -eq 0 ]
  [[ "$output" == *"ki version: 0.2.0"* ]]
  [[ "$output" == *"installation: linked development checkout"* ]]
}

@test "acquisition root and leaf help are available" {
  run "$KI" help acquire chatgpt import
  [ "$status" -eq 0 ]
  [[ "$output" == *"--output <kep-directory>"* ]]

  run "$KI" acquire chatgpt import --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"local capture"* ]]
}

@test "imports a deterministic KEP with preserved source bytes" {
  capture="$BATS_TEST_TMPDIR/capture"
  first="$BATS_TEST_TMPDIR/first.kep"
  second="$BATS_TEST_TMPDIR/second.kep"
  make_capture "$capture"

  run "$KI" acquire chatgpt import "$capture" --output "$first"
  [ "$status" -eq 0 ]
  [[ "$output" == *"KEP created:"* ]]
  [ -f "$first/kep.toml" ]
  [ -f "$first/checksums/sha256sums.txt" ]
  cmp "$capture/originals/export.json" "$first/source/originals/export.json"
  cmp "$capture/assets/example.png" "$first/assets/example.png"

  run "$KI" acquire chatgpt import "$capture" --output "$second"
  [ "$status" -eq 0 ]
  diff -r "$first" "$second"
}

@test "emits lexicographically ordered checksums and the matching KEP identity" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/validated.kep"
  make_capture "$capture"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 0 ]

  checksum_file="$output_dir/checksums/sha256sums.txt"
  checksum_paths=$(awk '{print $2}' "$checksum_file")
  [ "$(printf '%s\n' "$checksum_paths" | LC_ALL=C sort)" = "$checksum_paths" ]
  while IFS='  ' read -r digest path; do
    [ "$digest" = "$(shasum -a 256 "$output_dir/$path" | awk '{print $1}')" ]
  done < "$checksum_file"

  payload_sha256=$(shasum -a 256 "$checksum_file" | awk '{print $1}')
  grep -F "payload_sha256 = \"$payload_sha256\"" "$output_dir/kep.toml"
  grep -F "package_id = \"kep:sha256:$payload_sha256\"" "$output_dir/kep.toml"
}

@test "passes the KIS-0002 validation fixture and detects payload drift" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/fixture.kep"
  make_capture "$capture"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 0 ]

  run "$VALIDATOR" "$output_dir"
  [ "$status" -eq 0 ]
  [[ "$output" == *"KEP valid:"* ]]

  printf '%s\n' 'drift' >> "$output_dir/source/records/conversation.md"
  run "$VALIDATOR" "$output_dir"
  [ "$status" -eq 1 ]
  [[ "$output" == *"checksum mismatch"* ]]
}

@test "the validation fixture permits an absent empty assets directory" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/no-assets.kep"
  make_capture "$capture"
  rm "$capture/assets/example.png"
  printf '%s\n' '{"type":"conversation-order","record":"records/conversation.md","position":1}' > "$capture/relationships/native.jsonl"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 0 ]
  rmdir "$output_dir/assets"

  run "$VALIDATOR" "$output_dir"
  [ "$status" -eq 0 ]
}

@test "dry-run validates the capture but creates no output" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/dry-run.kep"
  make_capture "$capture"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Dry run: no files written."* ]]
  [ ! -e "$output_dir" ]
}

@test "JSON reports package identity, inventory, omissions, and limits" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/result.kep"
  make_capture "$capture"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir" --dry-run --json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"version":1'* ]]
  [[ "$output" == *'"status":"dry-run"'* ]]
  [[ "$output" == *'"package_id":"kep:sha256:'* ]]
  [[ "$output" == *'"relationships":2'* ]]
  [[ "$output" == *'"limitations"'* ]]
  [ ! -e "$output_dir" ]
}

@test "imports without network or repository commands" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/isolation.kep"
  spies="$BATS_TEST_TMPDIR/spies"
  make_capture "$capture"
  mkdir "$spies"
  for command in curl git open; do
    cat > "$spies/$command" <<'EOF'
#!/usr/bin/env sh
exit 99
EOF
    chmod 755 "$spies/$command"
  done

  run env PATH="$spies:$PATH" "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 0 ]
  [ -f "$output_dir/kep.toml" ]
}

@test "rejects malformed metadata before creating output" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/bad.kep"
  make_capture "$capture"
  printf '%s\n' 'unknown = "field"' >> "$capture/capture.toml"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unsupported field"* ]]
  [ ! -e "$output_dir" ]
}

@test "rejects a relationship that references a missing asset" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/missing-asset.kep"
  make_capture "$capture"
  printf '%s\n' '{"type":"message-asset","record":"records/conversation.md","asset":"assets/missing.png","message_id":"message-002"}' >> "$capture/relationships/native.jsonl"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing asset"* ]]
  [ ! -e "$output_dir" ]
}

@test "rejects non-native relationship records and conflicting output" {
  capture="$BATS_TEST_TMPDIR/capture"
  output_dir="$BATS_TEST_TMPDIR/existing.kep"
  make_capture "$capture"
  printf '%s\n' '{"type":"semantic-similarity","record":"records/conversation.md"}' > "$capture/relationships/native.jsonl"

  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not a supported source-native"* ]]
  [ ! -e "$output_dir" ]

  mkdir "$output_dir"
  run "$KI" acquire chatgpt import "$capture" --output "$output_dir"
  [ "$status" -eq 1 ]
  [[ "$output" == *"already exists"* ]]
}

@test "rejects grammar without inspecting a capture" {
  run "$KI" acquire chatgpt import --output "$BATS_TEST_TMPDIR/output.kep"
  [ "$status" -eq 2 ]
  [[ "$output" == *"capture-directory must come before options"* ]]
  [ ! -e "$BATS_TEST_TMPDIR/output.kep" ]
}
