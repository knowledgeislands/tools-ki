# Repository operations — REPO-OPS

This area specifies repository operations other than the focused audit contract in [repository-audit.md](repository-audit.md); see the [Feature Definitions index](index.md) for corpus conventions and registered prefixes.

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

`ki repo roadmap list` MUST render the selected repository's governed work inventory from its declared planning source, including native Knowledge Base Streams without creating or requiring a flat roadmap.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `reads declared Knowledge Base Streams without requiring or changing a flat roadmap` and `lists and filters grouped governed work items without JSON output`.

### REPO-OPS-006 — Guarded roadmap maintenance

`ki repo roadmap` MUST prune only completed work records and move one unambiguous record only through valid directional horizon transitions.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `prunes only completed items across selected repositories after every target is valid`, `promotes and demotes one explicit item with directional horizon validation`, and `rejects ambiguous roadmap identifiers before changing or pruning a work item`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
