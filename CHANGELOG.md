# Changelog

Notable changes to `ki` are recorded against the version in which they ship. During 0.x development, work since the latest release stays under Unreleased; a proposed 1.0 command inventory is not a release entry. The manual and `ki --help` describe the current command surface.

## [Unreleased]

### Added

- Repository roadmap summaries, linked task details, and undeclared source-store detection.
- Owner-declared Agora membership and inclusion resolution, with the named owner first in Zed's sidebar.
- Granola desktop image acquisition for Knowledge Base meetings, with attachment omissions visible in status.

### Changed

- Moved batch and trade commands under `ki repo`, with repository and estate selection on their common parent.
- Grouped root help by task and ordered subcommands alphabetically.
- Aligned the self-CI installation with the current checkout and kept repository governance aligned with Arcadia.

### Fixed

- Kept registry and repair previews read-only, recovery commands available with malformed MCP bindings, and enumerated-option validation consistent.
- Improved roadmap and Agora report labels and separated resolution and inventory responsibilities.

## [0.4.2] — 2026-09-26

### Fixed

- Pinned the verified Harness revision for compatible governance audits.

## [0.4.1] — 2026-09-26

### Fixed

- Pinned the verified Harness revision and reconciled release-maintenance compatibility.

## [0.4.0] — 2026-09-18

### Added

- Provider-neutral acquisition commands with verified adapter declarations, resumable journals, component checkpoints, governed reset, and disposition tracking.

### Changed

- Strengthened repository roadmap lifecycle, timestamp validation, audit presentation, batch authority, and human-readable statistics.
- Consolidated CLI architecture, documentation, test coverage, release gates, and the canonical Harness pin for the working-area contract transition.

Earlier 0.x releases are documented by their tags and commit history; this changelog does not reconstruct them retroactively.
