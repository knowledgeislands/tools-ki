---
id: KI-TOOL-CLI-107
area: CLI
title: Bootstrap keeps local development
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 2bdf302840910ec90d332aabebf77f0fc9ea82cf
created_at: 2026-10-06T19:00:00Z
updated_at: 2026-10-06T19:36:00Z
---

# Bootstrap keeps local development

## Goal

`ki bootstrap` and `ki bootstrap --refresh` keep an active canonical Harness local development binding instead of silently restoring the pinned archive, and warn loudly when a binding cannot be kept.

## Context

Kris approved this fix with the v0.7.1 release on 2026-10-06. With `knowledgeislands/ki-agentic-harness` in local mode (`ki dev local on`), running `ki bootstrap`, as is usual after installing a release, replaced the development link with the pinned archive. The core skills were re-pointed through the Harness root, but every other managed canonical skill link still targeted the checkout, so audits failed RUNTIMES-2 "unsafe or incompatible managed-skill link" until `ki dev local on` was re-run.

## Boundary

- Keep the binding when the canonical root link resolves to the configured checkout; project the core skills from that checkout, as `ki dev local on` does.
- When the root link cannot be kept (checkout missing, link to another checkout, no configured source), warn on standard error with the reason and recovery, then restore the archive.
- Fail closed, leaving the binding in place, when the active checkout fails inspection.
- `install.sh` and the Homebrew formula never touch Harness state, and `ki update`, `ki harness reinstall` and `ki harness uninstall` already refuse a development-linked Harness; none changes.
- Do not change `ki dev local` grammar or the non-canonical Harness lifecycle beyond letting archive restoration replace a link whose checkout is gone.

## Current state

`bootstrapEnvironment` in `src/core/harness/bootstrap/operation.ts` detected an active canonical local binding, projected the core skills through the installed root, then restored the archive inside the projection's finalize step. Only failure preserved local mode (dcdb1bc); success always left it.

## Steps

- [x] `src/core/storage/harness-development.ts`: classify the canonical root as `archive`, `active` or `unavailable` with a reason and link target.
- [x] `src/core/harness/bootstrap/`: keep an active binding and emit `canonical-harness-local`; emit `development-binding-lost` before restoring the archive, then re-point the core skills and every other configured canonical skill the archive provides, as `ki dev local off` does; drop the configuration snapshot and `preserveHarnessRoot` source mode that only served the old restore-in-finalize path.
- [x] `src/core/storage/harness-installation.ts`, `src/core/harness/inspection.ts`: archive restoration replaces any root link, without reading a link whose checkout is gone, and install-time discovery excludes the slot being replaced.
- [x] `src/commands/bootstrap/`: render the kept binding on standard output and the warning on standard error.
- [x] Tests: kept binding across bootstrap and refresh with a non-core canonical skill, rollback on a failed refresh, the three warning reasons, an incomplete active checkout, and `ki dev local off` over a link whose checkout is missing.
- [x] Documentation: BOOT-004, the getting-started and local-development guides, `man/ki.1` and `CHANGELOG.md`.

## Files touched

- `src/core/storage/harness-development.ts`, `harness-installation.ts`, `index.ts`
- `src/core/harness/bootstrap/operation.ts`, `types.ts`, `src/core/harness/inspection.ts`
- `src/commands/bootstrap/index.ts`, `ports.ts`, `src/agents/bootstrap.ts`
- `src/tests/cli/bootstrap/bootstrap.test.ts`, `src/tests/cli/dev/dev.test.ts`
- `docs/specs/bootstrap.md`, `docs/guides/user/getting-started.md`, `docs/guides/developer/local-development.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`

## Verify

```bash
bun run test:coverage
bunx tsc --noEmit
bunx biome check .
bun run ki:tools:lint-man
ki repo audit --repo . --progress never --concise
```

Coverage stays at 100%, biome reports no errors and the audit reports FAIL=0.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None; the change restores the documented intent of local development rather than making a new structural choice.

### Specifications

`docs/specs/bootstrap.md` gains BOOT-004.

### Guides

The getting-started and local-development guides, `man/ki.1` and `CHANGELOG.md` describe the kept binding and the warning.

### Roadmap

This record.

## Review

### Delivered

Bootstrap keeps an active canonical local binding and warns loudly before restoring the archive when the binding cannot be kept. Baseline `2bdf302840910ec90d332aabebf77f0fc9ea82cf`; the delivery commit follows it on `main`.

### Change Summary

- Kept binding: core skills project from the checkout with `replace`, configuration reconciles in the projection's finalize step, and the output reads `canonical harness kept in local development<TAB><checkout>`. No network is used.
- Lost binding: `ki: warning: leaving local development for <id>: <reason>; restoring the verified archive and re-pointing its configured skills. To resume, run ki dev local on <id> once its checkout is available` (or `ki dev local set <id> <checkout>` first when no source is configured), then the archive is restored and every configured canonical skill it provides is re-pointed.
- Archive restoration (bootstrap and `ki dev local off`) replaces any root link, including one whose checkout is gone, which previously failed with "local development link is broken".
- No approved deviations.

### Verification

- `bun run test:coverage`: 64 files, 1066 tests passed; statements, branches, functions and lines at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bun run ki:tools:lint-man` and `bunx knip`: clean.
- `man/ki.commands.json` regenerated with `bun scripts/generate-command-inventory.ts --write`.
- The archive-restoring re-projection was exercised once with a temporary test that substituted a fixture release for the canonical registry entry: both `ki bootstrap` and `ki bootstrap --refresh` restored the archive, re-pointed `ki-bootstrap` and a configured `ki-authoring` into it, skipped an unselected skill, and kept `[skills.ki-authoring]`. The test was not kept, because CLI tests may not import product modules.

### Outstanding concerns

- The archive-restoring fallback for the canonical Harness cannot succeed in the no-network sandbox, because the fixture cannot match the pinned canonical digest. Tests prove the warning and the failure path, and a non-canonical `ki dev local off` test proves archive replacement over a link whose checkout is missing. The post-restore re-projection carries `v8 ignore` guards with that proof, following the existing canonical fresh-install precedent.
- Pre-existing, not addressed: when a lost binding cannot be replaced (for example offline), the dangling root link stays and other commands still fail on it until the checkout returns or the archive can be fetched. Candidate follow-up.
- A canonical checkout that fails inspection now fails bootstrap and keeps local mode rather than silently restoring the archive; this is a deliberate fail-closed choice.

### Post-change review

A Fable review of the uncommitted diff confirmed the symlink replacement safety, prefix uniqueness with the replaced slot excluded from discovery, rollback, and the refusals by `ki update`, `ki harness reinstall` and `ki harness uninstall`. Its findings were addressed: the lost-binding path now re-points every configured canonical skill instead of advising `ki repair`, the recovery advice depends on the reason, a stale coverage guard was removed, the tests assert standard error and the mismatched case's exit and link state, and BOOT-004 reads "MUST NOT restore the verified archive".

### Mini recap

Bootstrap no longer silently leaves canonical local mode: it keeps an active binding, and when one cannot be kept it warns on standard error, restores the archive and re-points the configured canonical skills.

## Discussion

### Installer and release path

`install.sh` only verifies and installs the executable and manual, and the Homebrew formula has no post-install step, so neither resets the Harness. The reset came from the customary `ki bootstrap` run after installing a release.
