# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Fixed

- The installer now selects Homebrew's modern OpenSSL on macOS when the system OpenSSL lacks Ed25519 support, and its test fixtures use Node's Ed25519 signer rather than the unsupported macOS signing interface.
- The release-signing public-key trust anchor now matches the protected environment's valid Ed25519 private key.

### Added

- A verified release installer for Apple Silicon and Intel macOS plus x86_64 glibc Linux, with an Ed25519-signed checksum manifest and a local-development-only `--link` mode.
- Initial `ki` seed executable with HELP, version, completion, and no-op doctor.
- User-assisted `ki acquire chatgpt import` with deterministic local KEP creation, dry-run, and JSON reporting.
- Read-only `ki paths`, useful local `ki doctor` output, JSON inspection results, the `ki version` command, and plural `ki completions`.
- A tracked `ki(1)` manual and `./install.sh --link` workflow that installs or links both the executable and manual for development against this checkout.
- A Bun and TypeScript-native command host with typed command modules, Bun-native tests, compiled standalone executable builds, and a regular installer path for the compiled artefact.
