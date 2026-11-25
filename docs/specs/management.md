# User management — MANAGE

This area specifies the user-oriented management interface; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Inventory and diagnosis

### MANAGE-001 — Repository-independent inventory

`ki inventory` MUST list installed capabilities and declared user skills without inspecting the current repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/list.test.ts` — `lists installed capabilities and declared user skills without inspecting the current repository`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-002 — Managed-state diagnosis

`ki doctor` MUST report configured skills whose active source cannot be resolved, the same tool/version, installation provenance, executing host platform/architecture, runtime/version and configuration state as `diag`, its read-only check scope, a healthy/unhealthy verdict, and pass/warn/fail/skipped counts that account for every reported check. It MUST NOT imply package or release freshness was checked.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/doctor.test.ts` — `reports a configured skill whose active source cannot be resolved`, `shares diagnostic host context and counts each completed check exactly once`, and `reports missing configuration in human form`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-003 — Deterministic capability search

`ki backpack search` MUST search verified installed capabilities case-insensitively in deterministic order without repository discovery.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `searches verified installed capabilities case-insensitively in deterministic order without repository discovery`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Updates and shell integration

### MANAGE-004 — Verified executable update

`ki update` MUST update the executable only when a persisted verified installer receipt proves it owns the running regular installation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/update.test.ts` — `updates only an installer-managed executable through its persisted verified installer`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-005 — Generated shell completions

`ki completion` MUST render supported shell completion scripts and reject unsupported shells.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/completions.test.ts` — `renders zsh and bash completion scripts` and `rejects an unsupported shell and requires a shell argument`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-006 — Managed-state diagnostics

`ki diag` MUST report share-safe tool/version, proven local/release/unknown installation mode, executing host platform/architecture, runtime/version, configuration and registry status and counts by default. Local provenance MUST identify a physically resolved development checkout through this tool's source/package markers and Git directory or valid worktree pointer; a source URL alone is insufficient. Unproven callers MUST report unknown provenance rather than infer release mode from a path or the internal regular-installation default. `--full` MAY include local paths, identities and detailed diagnostics. It MUST NOT inspect a repository declaration or its projections.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/diag.test.ts` — `does not inspect repository state for user diagnostics`, `leaves direct repository projection health to ki repo diag`, `reports the entrypoint-proven installation mode`, `normalizes executing host names without treating regular fallback as release provenance`, and `proves checkout identity from resolved entrypoints and refuses copied or incomplete source`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-007 — Safe managed projection repair

`ki repair` MUST preview repairs to missing or stale KI-managed user-skill projections by default and require `--apply` to write. It may remove a recognised legacy `schema = 1` line from valid user configuration, preserving all other content. It MUST preserve foreign and unknown state as unsafe and support an explicit no-write `--dry-run` preview. Combining `--apply` with `--dry-run` MUST fail. Ordinary reads MUST NOT rewrite configuration.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/repair.test.ts` — `re-points a stale symbolic link and preserves a non-link as unsafe`, `reports a dry-run link repair without changing it`, `previews and explicitly removes a recognised legacy config marker without changing other content`, and `rejects unknown and noncanonical legacy markers without rewriting configuration`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-008 — Non-mutating cleanup report

`ki cleanup` MUST report when no eligible KI-managed stale state exists without changing installed backpacks or unknown files.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `reports no eligible managed stale state without changing any installed backpack or unknown file`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-009 — Canonical documentation lookup

`ki docs` MUST print canonical KI documentation locations without launching applications or fetching their content.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/local-commands.test.ts` — `prints canonical documentation URLs without launching or fetching content`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### MANAGE-010 — Closed option-value completion

`ki completion` MUST offer every closed value for a value-taking public CLI option after that option is supplied, including roadmap horizons and lifecycle statuses.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/completions.test.ts` — `emits loadable scripts whose Bash completion reaches repo roadmap`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Retired local editor projections

### MANAGE-011 — ~~VS Code projection diagnosis~~ (deprecated)

Superseded on 25 November 2026, when `ki vscode` was retired: chezmoi's `workspaces vscode populate` and `workspaces vscode clean` own VS Code workspaces, and the trusted-folder list is maintained by hand in the chezmoi source, which `chezmoi apply` renders for each client.

### MANAGE-012 — ~~Explicit VS Code projection publication~~ (deprecated)

Superseded on 25 November 2026, when `ki vscode` was retired: chezmoi's `workspaces vscode populate` and `workspaces vscode clean` own VS Code workspaces, and the trusted-folder list is maintained by hand in the chezmoi source, which `chezmoi apply` renders for each client.

### MANAGE-013 — ~~Typed VS Code store projection~~ (deprecated)

Superseded on 25 November 2026, when `ki vscode` was retired: chezmoi's `workspaces vscode populate` and `workspaces vscode clean` own VS Code workspaces, and the trusted-folder list is maintained by hand in the chezmoi source, which `chezmoi apply` renders for each client.

### MANAGE-018 — ~~Obsolete VS Code project removal~~ (deprecated)

Superseded on 25 November 2026, when `ki vscode` was retired: chezmoi's `workspaces vscode populate` and `workspaces vscode clean` own VS Code workspaces, and the trusted-folder list is maintained by hand in the chezmoi source, which `chezmoi apply` renders for each client.

## MCP source releases

### MANAGE-014 — Exact governed source provenance

`ki mcp install` MUST accept a lower-case GitHub `owner/repository`, resolve an explicit SemVer only through its exact annotated `v<SemVer>` tag, verify the tag's full commit and governed MCP repository evidence, and persist a versioned provenance receipt without credentials or host paths.

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

`ki mcp list` MUST expose active and retained versions deterministically as text or versioned path-free JSON. Installing, updating, rolling back, listing, or uninstalling a source MUST NOT modify any MCP client binding.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/mcp.test.ts` — `installs an exact source release and exposes path-free provenance` and `updates from the latest stable release, rolls back without execution, and uninstalls`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
