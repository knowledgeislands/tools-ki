# User management — MANAGE

This area specifies the user-oriented management interface; see the [Feature Definitions index](index.md) for the corpus conventions and registered prefixes.

## Inventory and diagnosis

### MANAGE-001 — Repository-independent inventory

`ki manage list` MUST list installed capabilities and declared user skills without inspecting the current repository.

_Verify:_ `src/tests/cli/manage/inventory.test.ts` — `lists installed capabilities and declared user skills without inspecting the current repository`.

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

## Gaps

No unbuilt candidate behaviour is in scope for this area.
