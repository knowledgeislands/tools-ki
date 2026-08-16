# Repository operations — REPO-OPS

This area specifies repository operations other than the focused audit contract in [repository-audit.md](repository-audit.md); see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Target and transaction boundaries

### REPO-OPS-001 — Independently preflighted targets

`ki repo` operations MUST preflight every explicit repository target before operating on the selected set.

_Verify:_ `src/tests/cli/repo/targets.test.ts` — `runs audit independently for every preflighted explicit target`.

### REPO-OPS-002 — Declared safe conform writes

`ki repo conform` MUST refuse a publication target outside the repository publication scope.

_Verify:_ `src/tests/cli/repo/conform-writes.test.ts` — `refuses a publication request outside the repository publication scope`.

### REPO-OPS-003 — Repository repair scope

`ki repo repair` MUST register the selected physical root before repairing a missing compatible repository projection.

_Verify:_ `src/tests/cli/repo/repair.test.ts` — `registers the selected physical root before repairing a missing compatible projection`.

### REPO-OPS-004 — Declared provider upgrades

`ki repo upgrade` MUST upgrade the uniquely resolved providers declared by the selected repository.

_Verify:_ `src/tests/cli/manage/update.test.ts` — `upgrades the uniquely resolved providers declared by the current repository`.

### REPO-OPS-005 — Governed roadmap inventory

`ki repo roadmap list` MUST resolve repository type from `[skills.ki-repo]` and render flat work items from the selected local adapter: `docs/roadmap/` for a project roadmap or `Streams/Roadmap/` for KB Streams, with the colocated `_ISSUES.md` treated as its ledger rather than a work item.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `lists flat Knowledge Base work items from the declared Streams roadmap and ignores its ledger` and `lists and filters grouped governed work items without JSON output`.

### REPO-OPS-006 — Guarded roadmap maintenance

`ki repo roadmap` MUST prune only completed work records and move one unambiguous record only through valid directional horizon transitions.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `promotes and prunes flat Knowledge Base work items without changing the ledger`, `prunes only completed items across selected repositories after every target is valid`, `promotes and demotes one explicit item with directional horizon validation`, and `rejects ambiguous roadmap identifiers before changing or pruning a work item`.

### REPO-OPS-007 — Repository projection diagnostics

`ki repo diag` MUST report the declared skill and compatible runtime projection health for every selected repository without changing repository or registry state. It MUST return non-zero when any selected repository is unrepairable.

_Verify:_ `src/tests/cli/repo/diag.test.ts` — `reports selected repository projection health without changing it` and `reports an unresolved declared provider as unrepairable`.

### REPO-OPS-008 — Fail-closed rubric activation evidence

When a repository rubric inspects or proposes a declared repository skill, the host MUST expose only its resolved compatible runtime projections. A missing projection is activatable only when every target is absent; a regular entry, dangling link, or link to another source is blocked and MUST remain unchanged. An undeclared skill or a declared skill with no compatible configured runtime is blocked before the rubric can activate it. After publishing an activation, `ki repo conform` MUST re-audit the same selected skills and report only that observed result.

_Verify:_ `src/tests/cli/repo/conform-execution.test.ts` — `activates a proposed declared runtime skill and re-audits it`, `refuses a proposed runtime activation with an unsafe managed-skill entry`, and `reports $title as blocked before a rubric can activate it`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
