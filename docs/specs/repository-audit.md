# Repository audit — REPO-AUDIT

This area specifies the as-built public behaviour of `ki repo audit`; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Repository and capability selection

### REPO-AUDIT-001 — Resolved repository required

`ki repo audit` MUST refuse to run when it cannot resolve a KI repository from the current working directory.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `requires a resolved KI repository`.

### REPO-AUDIT-002 — Declared mechanical audit

`ki repo audit` MUST run only the mechanical rubric items of the repository's declared selected skills.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `runs only a declared skill's mechanical rubric items`.

### REPO-AUDIT-003 — Exact capability selection

When `--skill` is supplied, `ki repo audit` MUST select the exact declared capability rather than one whose name merely shares its prefix.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `selects an exact capability when another declared skill extends its name`.

## Results and output

### REPO-AUDIT-004 — Finding visibility

`ki repo audit` MUST omit the per-skill results tree when every selected skill passes without a finding, render WARN and FAIL findings by default when results require attention, and allow `--reporter-levels` to select named outcome levels or all current outcome levels.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `runs only a declared skill's mechanical rubric items` and `filters complete outcome levels by default and renders every level on request`.

### REPO-AUDIT-005 — Validated output controls

`ki repo audit` MUST accept only its documented `--progress`, `--progress-style`, and `--reporter-levels` values, rejecting invalid values before it runs an audit.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `exposes and validates repository-operation output controls`.

### REPO-AUDIT-006 — Failure exit status

`ki repo audit` MUST return a failure exit status when a FAIL-level audit finding exists.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `fails when a FAIL-level item reports a violation`.

### REPO-AUDIT-007 — Multi-repository summary

For more than one selected repository, `ki repo audit` MUST audit each repository independently and render a summary with every repository verdict and aggregate finding volume.

_Verify:_ `src/tests/cli/repo/targets.test.ts` — `runs audit independently for every preflighted explicit target` and `recaps every repository verdict and aggregate finding volume`.

### REPO-AUDIT-008 — Honest interactive progress

When repository progress is enabled, `ki repo audit` MUST render elapsed time and indeterminate activity without treating item counts or declared cost as estimated completion. Multi-skill progress MUST emit each evidence-ready skill once as a completed receipt, hide queued work, and collapse those temporary receipts into one aggregate evidence receipt.

_Verify:_ `src/tests/cli/repo/repo.test.ts` — `renders a compact TTY receipt stream without changing non-interactive output` and `uses the same activity bar regardless of declared item cost`; `src/tests/cli/repo/progress-stages.test.ts` — `keeps a counted evidence step indeterminate instead of treating it as estimated completion` and `shows evidence-ready skills as full receipts, then collapses them once`.

## Gaps

No unbuilt candidate behaviour is in scope for this pilot.
