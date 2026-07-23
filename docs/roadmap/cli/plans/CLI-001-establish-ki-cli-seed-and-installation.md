---
id: 'CLI-001'
title: Establish the KI CLI seed and user installation route
status: done
roadmap: cli/establish-the-ki-cli-seed-and-user-installation-route
blocks: CLI-002
blocked-by: —
---

## Context

`ki` is the end-user Knowledge Islands command-line interface. Its first release must establish a stable executable, help model, and installation route before it grows into package, user, repository, or acquisition lifecycle dispatch.

## Current state

The seed now provides an executable, local installer, Bats suite, ShellCheck/Bats CI, configuration, and changelog. It implements no KEP or lifecycle dispatch.

## Steps

1. [x] Adopt the completed FND-003 user guide and command contract as the local product contract, including exact root and leaf HELP, output streams, exit codes, version shape, completion, and the no-op `ki doctor` response.
2. [x] Scaffold this single-command Bash 3.2 tool repository with its `ki-tools` container: `.ki-config.toml`, executable `bin/ki`, `install.sh`, Bats suite, ShellCheck/Bats CI, changelog, and release documentation. Do not add a language runtime or a second tool.
3. [x] Implement one available-command definition that derives root HELP, `ki help`, `--help`, `--version`, Bash/Zsh completion, and parser refusal behaviour without runtime, filesystem, repository, network, or child-process access.
4. [x] Implement root `ki doctor` as the fixed, honest coming-soon response defined by FND-003. It exits successfully and inspects or changes neither user nor repository state.
5. [x] Implement the minimal installer with an explicit user command directory, idempotent replacement, payload-integrity checks, and an actionable PATH recovery message. Keep release lookup and transport behind fixtures until a release channel exists.
6. [x] Test the executable and installer on macOS system Bash and Linux for help/version/completion parity, parser errors, doctor non-interference, installation, repeat installation, integrity failure, and PATH recovery.
7. [x] Run the applicable `ki-repo`, `ki-tools`, ShellCheck, Bats, documentation, and roadmap checks; prepare the plan for manual acceptance.

## Files touched

- `bin/ki` and `install.sh`
- `tests/`, `.github/workflows/`, `CHANGELOG.md`, and repository governance/configuration files
- CLI user and release documentation
- `docs/roadmap/cli/ROADMAP.md` and this plan

## Verify

1. `ki --help`, `ki help`, `ki --version`, `ki completion bash`, `ki completion zsh`, and `ki doctor` run with Bash 3.2 and no package manager, network access, repository inspection, or child process.
2. `ki doctor` makes no user- or repository-scope filesystem change and reports its deliberately limited availability plainly.
3. The installer is idempotent, verifies the selected payload, and gives a precise PATH recovery route without writing outside its selected user command directory.
4. Bats, ShellCheck, CI, and applicable repository audits pass on macOS and Linux.
5. No user/repository lifecycle dispatch or acquisition behaviour is released in this plan.

## Dependencies / blocks

This plan is blocked in practice by acceptance of harness FND-003's public manual and root-doctor contract; that external plan is deliberately not encoded as a local plan dependency. It blocks CLI-002.

## Acceptance

### Delivered

A Bash 3.2 `ki` seed with HELP, version, Bash/Zsh completion, no-op doctor, reserved acquisition refusal, and an isolated installer.

### Summary of changes

- Added `bin/ki`, `install.sh`, Bats tests, CI, tool configuration, and changelog.
- Kept user/repository dispatch and acquisition unavailable.

### Verification

- `shellcheck bin/ki install.sh` — passed.
- `bats tests` — passed.
- `ki-repo-roadmap` audit — passed with no FAIL or WARN findings.
- Evidence: `e8cb0df`, `df27b22`.

### Outstanding concerns

Release-asset transport and Homebrew delivery remain later work. CLI-002 owns acquisition against Draft KIS-0002.

### Mini recap

The seed proves the executable boundary without requiring a runtime or claiming lifecycle behaviour it does not yet provide.

## Done

Manual acceptance confirmed the seed executable and local installer. CLI-002 remains the next planned capability; tagged-release transport and Homebrew delivery remain later work.
