# User management — MANAGE

This area specifies the user-oriented management interface; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Inventory and diagnosis

### MANAGE-001 — Repository-independent inventory

`ki manage list` MUST list installed capabilities and declared user skills without inspecting the current repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/list.test.ts` — `lists installed capabilities and declared user skills without inspecting the current repository`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-002 — Managed-state diagnosis

`ki manage doctor` MUST report configured skills whose active source cannot be resolved.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/doctor.test.ts` — `reports a configured skill whose active source cannot be resolved`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-003 — Deterministic capability search

`ki manage search` MUST search verified installed capabilities case-insensitively in deterministic order without repository discovery.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `searches verified installed capabilities case-insensitively in deterministic order without repository discovery`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Updates and shell integration

### MANAGE-004 — Verified executable update

`ki manage update` MUST update the executable only when a persisted verified installer receipt proves it owns the running regular installation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/update.test.ts` — `updates only an installer-managed executable through its persisted verified installer`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-005 — Generated shell completions

`ki manage completion` MUST render supported shell completion scripts and reject unsupported shells.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/completions.test.ts` — `renders zsh and bash completion scripts` and `rejects an unsupported shell and requires a shell argument`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-006 — Managed-state diagnostics

`ki manage diag` MUST report only machine-managed installation, user configuration, registry, and path state. It MUST NOT inspect a repository declaration or its projections.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/diag.test.ts` — `does not inspect repository state for user diagnostics` and `leaves direct repository projection health to ki repo diag`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-007 — Safe managed projection repair

`ki manage repair` MUST repair only missing or stale KI-managed user-skill projections, preserve foreign state as unsafe, and support a no-write `--dry-run` preview.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/repair.test.ts` — `re-points a stale symbolic link and preserves a non-link as unsafe` and `reports a dry-run link repair without changing it`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-008 — Non-mutating cleanup report

`ki manage cleanup` MUST report when no eligible KI-managed stale state exists without changing installed harnesses or unknown files.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `reports no eligible managed stale state without changing any installed harness or unknown file`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-009 — Canonical documentation lookup

`ki manage docs` MUST print canonical KI documentation locations without launching applications or fetching their content.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `prints canonical documentation URLs without launching or fetching content`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-010 — Closed option-value completion

`ki manage completion` MUST offer every closed value for a value-taking public CLI option after that option is supplied, including roadmap horizons and lifecycle statuses.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/completions.test.ts` — `emits loadable scripts whose Bash completion reaches repo roadmap`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Local editor projections

### MANAGE-011 — VS Code projection diagnosis

`ki manage vscode check` MUST compare the chezmoi-managed VS Code workspace and trusted-folder source state with the local KI repository registry without writing.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/vscode.test.ts` — `synchronises missing workspaces and runtime-scoped trusted folders` proves the check reports drift before the write and passes after reconciliation.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-012 — Explicit VS Code projection publication

`ki manage vscode sync` MUST preview source-state drift by default and MUST publish it only when `--write` is supplied, without running `chezmoi apply`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/vscode.test.ts` — `synchronises missing workspaces and runtime-scoped trusted folders`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-013 — Typed VS Code store projection

`ki manage vscode check|sync` MUST consume only explicit local `sources` bindings for registered repositories, project each bound source beside its notes root with the same trusted runtime clients, and ignore `legacy` bindings and unbound filesystem directories. It MUST NOT infer associations from directory names.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/vscode.test.ts` — `consumes explicit sources bindings and ignores legacy and unbound directories` and `fails closed for unsafe workspace names, collisions, and invalid bound sources`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## MCP source releases

### MANAGE-014 — Exact governed source provenance

`ki manage mcp install` MUST accept a lower-case GitHub `owner/repository`, resolve an explicit SemVer only through its exact annotated `v<SemVer>` tag, verify the tag's full commit and governed MCP repository evidence, and persist a versioned provenance receipt without credentials or host paths.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/mcp.test.ts` — `installs an exact source release and exposes path-free provenance` and `rejects invalid latest-release responses and source evidence`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-015 — Deliberate latest-release authentication

When the version is omitted, MCP source installation and update MUST resolve only the latest stable GitHub Release. Public resolution MUST be unauthenticated; private resolution MUST require explicit `--auth github-cli`, use the existing GitHub CLI session, and neither read, persist, nor display a credential.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/mcp.test.ts` — `updates from the latest stable release, rolls back without execution, and uninstalls` and `uses explicit GitHub CLI authentication without leaking command output`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-016 — Failure-atomic activation and retained rollback

MCP source install and update MUST build from a committed Bun lockfile in same-filesystem staging and atomically activate only a complete verified build. A failure MUST preserve the prior active version. Rollback MUST activate a retained complete installation without network access or execution, and uninstall MUST remove only the validated exact repository installation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/mcp.test.ts` — `preserves the active version when a replacement build fails` and `updates from the latest stable release, rolls back without execution, and uninstalls`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-017 — Inspectable source inventory

`ki manage mcp list` MUST expose active and retained versions deterministically as text or versioned path-free JSON. Installing, updating, rolling back, listing, or uninstalling a source MUST NOT modify any MCP client binding.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/mcp.test.ts` — `installs an exact source release and exposes path-free provenance` and `updates from the latest stable release, rolls back without execution, and uninstalls`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
