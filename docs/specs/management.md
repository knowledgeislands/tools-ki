# User management — MANAGE

This area specifies the user-oriented management interface; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Inventory and diagnosis

### MANAGE-001 — Repository-independent inventory

`ki manage list` MUST list installed capabilities and declared user skills without inspecting the current repository.

_Verify:_ `src/tests/cli/manage/list.test.ts` — `lists installed capabilities and declared user skills without inspecting the current repository`.

### MANAGE-002 — Managed-state diagnosis

`ki manage doctor` MUST report configured skills whose active source cannot be resolved.

_Verify:_ `src/tests/cli/manage/doctor.test.ts` — `reports a configured skill whose active source cannot be resolved`.

### MANAGE-003 — Deterministic capability search

`ki manage search` MUST search verified installed capabilities case-insensitively in deterministic order without repository discovery.

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `searches verified installed capabilities case-insensitively in deterministic order without repository discovery`.

## Updates and shell integration

### MANAGE-004 — Verified executable update

`ki manage update` MUST update the executable only when a persisted verified installer receipt proves it owns the running regular installation.

_Verify:_ `src/tests/cli/manage/update.test.ts` — `updates only an installer-managed executable through its persisted verified installer`.

### MANAGE-005 — Generated shell completions

`ki manage completion` MUST render supported shell completion scripts and reject unsupported shells.

_Verify:_ `src/tests/cli/manage/completions.test.ts` — `renders zsh and bash completion scripts` and `rejects an unsupported shell and requires a shell argument`.

### MANAGE-006 — Managed-state diagnostics

`ki manage diag` MUST report only machine-managed installation, user configuration, registry, and path state. It MUST NOT inspect a repository declaration or its projections.

_Verify:_ `src/tests/cli/manage/diag.test.ts` — `does not inspect repository state for user diagnostics` and `leaves direct repository projection health to ki repo diag`.

### MANAGE-007 — Safe managed projection repair

`ki manage repair` MUST repair only missing or stale KI-managed user-skill projections, preserve foreign state as unsafe, and support a no-write `--dry-run` preview.

_Verify:_ `src/tests/cli/manage/repair.test.ts` — `re-points a stale symbolic link and preserves a non-link as unsafe` and `reports a dry-run link repair without changing it`.

### MANAGE-008 — Non-mutating cleanup report

`ki manage cleanup` MUST report when no eligible KI-managed stale state exists without changing installed harnesses or unknown files.

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `reports no eligible managed stale state without changing any installed harness or unknown file`.

### MANAGE-009 — Canonical documentation lookup

`ki manage docs` MUST print canonical KI documentation locations without launching applications or fetching their content.

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `prints canonical documentation URLs without launching or fetching content`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
