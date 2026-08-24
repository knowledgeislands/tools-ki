# Repository operations — REPO-OPS

This area specifies repository operations other than the focused audit contract in [repository-audit.md](repository-audit.md); see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Target and transaction boundaries

### REPO-OPS-001 — Independently preflighted targets

`ki repo` operations MUST preflight every explicit repository target before operating on the selected set.

_Verify:_ `src/tests/cli/repo/targets.test.ts` — `runs audit independently for every preflighted explicit target`.

### REPO-OPS-002 — Declared safe conform writes

`ki repo conform` MUST refuse a publication target outside the repository publication scope.

_Verify:_ `src/tests/cli/repo/conform-execution.test.ts` — `refuses an unsafe direct conform write before publication`.

### REPO-OPS-003 — Repository repair scope

`ki repo repair` MUST register the selected physical root before repairing a missing compatible repository projection.

_Verify:_ `src/tests/cli/repo/repair.test.ts` — `registers the selected physical root before repairing a missing compatible projection`.

### REPO-OPS-004 — Declared provider upgrades

`ki repo upgrade` MUST upgrade the uniquely resolved providers declared by the selected repository.

_Verify:_ `src/tests/cli/manage/update.test.ts` — `upgrades the uniquely resolved providers declared by the current repository`.

### REPO-OPS-005 — Governed roadmap inventory

`ki repo roadmap list` MUST resolve repository type from `[skills.ki-repo]` and render flat work items from the selected local adapter: `docs/roadmap/` for a project roadmap or `Streams/Roadmap/` for KB Streams, with the colocated `_ISSUES.md` ledger and KB `Roadmap.md` navigation note treated as adapter-owned surfaces rather than work items.

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

### REPO-OPS-009 — Conditional conform re-audit

After publishing staged writes or running staged commands, `ki repo conform` MUST re-audit the same selected skills and report that second pass as `re-audit`. When conform stages no operation, it MUST skip that second pass and report that no re-audit is required.

_Verify:_ `src/tests/cli/repo/conform-writes.test.ts` — `does not re-audit a clean conform that staged no operation`, `publishes a complete conform write set, supports dry-run, and re-audits`, and `runs an eligible guarded command only with explicit authority and re-audits it`.

### REPO-OPS-010 — Adapter-owned roadmap metadata

For the `kb-streams` adapter, `ki repo roadmap` MUST project and validate the common work lifecycle fields while accepting additional frontmatter fields, including opaque indented continuations attached to those fields, whose semantics remain owned by native Knowledge Base governance. It MUST continue rejecting missing, malformed, or repeated common fields. Project roadmaps MUST retain their closed frontmatter field contract.

A KB Streams horizon mutation MUST preserve every unconsumed frontmatter field and body byte except for the requested `horizon` change and the contract-owned `candidate` field required by or prohibited outside the `future` horizon.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `projects adapter-owned KB metadata alongside a strict project roadmap in one selection`, `diagnoses unavailable, malformed, and misconfigured Knowledge Base roadmaps without falling back`, `rejects every malformed canonical frontmatter shape`, and `promotes and prunes flat Knowledge Base work items without changing the ledger`.

### REPO-OPS-011 — Absent roadmap projection

`ki repo roadmap list` MUST treat a selected repository with no physical directory for its declared local roadmap adapter as contributing no roadmap rather than as a diagnostic or non-zero result. It MUST continue reporting malformed, unsafe, unreadable, or misconfigured roadmap evidence as diagnostics that make the command non-zero.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `treats absent Knowledge Base roadmaps as empty but diagnoses malformed and misconfigured ones` and `isolates missing, malformed, invalid-status, and unsafe roadmap entries`.

### REPO-OPS-012 — Aggregate roadmap inventory

With `--aggregate`, `ki repo roadmap list` MUST render one selected-set inventory grouped by local horizon, using each item’s canonical identifier as its identity. It MUST identify selected repositories that contribute no roadmap and MUST NOT imply a shared cross-repository priority order.

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `aggregates selected roadmaps while treating absent roots as empty`.

### REPO-OPS-013 — Repository-local self governance

For a selected physical repository that explicitly declares `[skills.ki-self]`, native repository operations MUST resolve only the physical contained `.agents/skills/ki-self/` source as `repository-local:ki-self`, validate its canonical identity and catalogue before import, and exclude it from installed-Harness upgrade and managed runtime projection; every other declared skill MUST continue to require a declared installed Harness provider.

_Verify:_ `src/tests/cli/repo/local-provider.test.ts` — `[ki repo] repository-local ki-self provider`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
