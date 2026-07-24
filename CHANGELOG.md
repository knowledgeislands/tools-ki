# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- Initial `ki` seed executable with HELP, version, completion, and no-op doctor.
- User-assisted `ki acquire chatgpt import` with deterministic local KEP creation, dry-run, and JSON reporting.
- Read-only `ki paths`, useful local `ki doctor` output, JSON inspection results, the `ki version` command, and plural `ki completions`.
- A tracked `ki(1)` manual and `./install.sh --link` workflow that installs or links both the executable and manual for development against this checkout.
- A Bun and TypeScript-native command host with typed command modules, Bun-native tests, compiled standalone executable builds, and a regular installer path for the compiled artefact.
