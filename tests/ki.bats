#!/usr/bin/env bats

KI="$BATS_TEST_DIRNAME/../bin/ki"

@test "root help and doctor are available" {
  run "$KI" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"doctor"* ]]
  run "$KI" doctor
  [ "$status" -eq 0 ]
  [[ "$output" == *"performs no checks"* ]]
}

@test "acquisition is reserved" {
  run "$KI" acquire
  [ "$status" -eq 2 ]
  [[ "$output" == *"not available"* ]]
}
