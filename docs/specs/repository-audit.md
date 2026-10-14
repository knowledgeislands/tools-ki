# Repository audit — REPO-AUDIT

This area specifies the as-built public behaviour of `ki repo audit`; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Repository and capability selection

### REPO-AUDIT-001 — Resolved repository required

`ki repo audit` MUST refuse to run when it cannot resolve a KI repository from the current working directory.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `requires a resolved KI repository`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-002 — Declared mechanical audit

`ki repo audit` MUST run only the mechanical rubric items of the repository's declared selected skills.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `runs only a declared skill's mechanical rubric items`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-003 — Exact capability selection

When `--skill` is supplied, `ki repo audit` MUST select the exact declared capability rather than one whose name merely shares its prefix.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `selects an exact capability when another declared skill extends its name`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Results and output

### REPO-AUDIT-004 — Finding visibility

`ki repo audit` MUST omit the per-skill results tree when every selected skill passes without a finding, render WARN and FAIL findings by default when results require attention, and allow `--reporter-levels` to select named outcome levels or all current outcome levels.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `runs only a declared skill's mechanical rubric items` and `filters complete outcome levels by default and renders every level on request`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-005 — Validated output controls

`ki repo audit` MUST accept only its documented `--progress`, `--progress-style`, and `--reporter-levels` values, and only `--paths` values inside the repository, rejecting invalid values before it runs an audit.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `exposes and validates repository-operation output controls`; `src/tests/cli/repo/verdict-scope.test.ts` — `refuses a path outside the repository and an unreadable index before auditing`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-006 — Failure exit status

`ki repo audit` MUST return a failure exit status when a FAIL-level audit finding exists.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `fails when a FAIL-level item reports a violation`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-007 — Multi-repository summary

For more than one selected repository, `ki repo audit` MUST audit each repository independently and render a summary with every repository verdict and aggregate finding volume.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/targets.test.ts` — `runs audit independently for every preflighted explicit target` and `recaps every repository verdict and aggregate finding volume`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-008 — Honest interactive progress

When repository progress is enabled, `ki repo audit` MUST render elapsed time and indeterminate activity without treating item counts or declared cost as estimated completion. Multi-skill progress MUST emit each evidence-ready skill once as a completed receipt, hide queued work, and collapse those temporary receipts into one aggregate evidence receipt.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `renders a compact TTY receipt stream without changing non-interactive output` and `uses the same activity bar regardless of declared item cost`; `src/tests/cli/repo/progress-stages.test.ts` — `keeps a counted evidence step indeterminate instead of treating it as estimated completion` and `shows evidence-ready skills as full receipts, then collapses them once`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-009 — Registered-estate selector

`ki repo --estate <operation>` MUST select all registered repositories before optional literal-prefix filtering and MUST be mutually exclusive with `--repo`, `--territory` and `--principals`. `ki repo --principals <operation>` MUST select the registered territory Capitals in the [principals order](territories.md#territory-005--principals-selection) under the same exclusion and filtering. `--territory` MUST accept a declared [territory alias](territories.md#territory-007--territory-aliases) as its canonical handle.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/territory/selection.test.ts` - Capital metadata, registration and selector failures; `src/tests/cli/territory/aliases.test.ts` — alias selection through `ki repo`; `src/tests/cli/repo/targets.test.ts` — `selects literal roots and standard glob patterns deterministically`; `src/tests/cli/territory/principals.test.ts` — principals repository selection and conflicts.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-010 — Criteria coverage disclosure

`ki repo audit` MUST disclose, beside every skill, repository, multi-repository and total verdict, how many of the selected mechanical criteria it evaluated and how many judgment criteria remain unassessed. A mechanical criterion is evaluated when it reports at least one outcome other than not-applicable. The disclosure MUST NOT change any verdict or exit status.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `discloses evaluated mechanical and unassessed judgment criteria`; `src/tests/cli/repo/targets.test.ts` — `recaps every repository verdict and aggregate finding volume`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-AUDIT-011 — Scoped verdict

With `--staged`, `--paths`, or both, `ki repo audit` MUST still evaluate every selected mechanical criterion against the whole repository and render every finding under the selected reporter levels, and MUST fail only on a FAIL finding whose subject names a scoped path, a path under a scoped directory, or a directory containing a scoped path, or on a local registration failure. `--staged` MUST read the staged paths, deletions included, from the repository's Git index through the injected runner and MUST fail before auditing when the index cannot be read. The output MUST name the scope, mark each finding outside it, and lead the summary with the scoped verdict and its counts before the whole-tree counts. Without either option, output and exit status MUST be unchanged.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/verdict-scope.test.ts` — `scopes the verdict to staged paths and marks findings outside it`, `keeps a finding on a containing directory in scope when a staged deletion sits under it`, `scopes the verdict to explicit paths, including everything under a named directory`, `attributes a finding by its subject within the repository only`, `keeps a local registration failure blocking under a scoped verdict` and `leaves the unscoped audit unchanged`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this pilot.
