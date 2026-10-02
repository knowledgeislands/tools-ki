# Repository operations — REPO-OPS

This area specifies repository operations other than the focused audit contract in [repository-audit.md](repository-audit.md); see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Target and transaction boundaries

### REPO-OPS-001 — Independently preflighted targets

`ki repo` operations MUST preflight every explicit repository target before operating on the selected set.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/targets.test.ts` — `runs audit independently for every preflighted explicit target`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-002 — Declared safe conform writes

`ki repo conform` MUST refuse a publication target outside the repository publication scope.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/conform-execution.test.ts` — `refuses an unsafe direct conform write before publication`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-003 — Repository repair scope

`ki repo repair` MUST register the selected physical root before repairing a missing compatible repository projection.

`ki repo repair --dry-run` and `ki registry add --dry-run` MUST NOT create a missing XDG state directory merely to preview registration. Without `--dry-run`, both commands apply their writes by default; repository store mutations and VS Code sync instead preview by default until `--write` is supplied.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repair.test.ts` — `registers the selected physical root before repairing a missing compatible projection`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-004 — Declared provider upgrades

`ki repo upgrade` MUST upgrade the uniquely resolved providers declared by the selected repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/update.test.ts` — `upgrades the uniquely resolved providers declared by the current repository`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-005 — Governed roadmap inventory

`ki repo roadmap list` MUST resolve repository type from `[skills.ki-repo]` and render flat work items from the selected local adapter: `docs/roadmap/` for a project roadmap or `Streams/Roadmap/` for KB Streams, with the colocated `_ISSUES.md` ledger and KB `Roadmap.md` navigation note treated as adapter-owned surfaces rather than work items.

`--horizon` MUST accept only the seven governed horizons and `--status` MUST accept only the five governed lifecycle states. An unsupported filter or output format MUST fail with a grammar error before repository inventory is read.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `lists flat Knowledge Base work items from the declared Streams roadmap and ignores its ledger` and `lists and filters grouped governed work items without JSON output`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-006 — Guarded roadmap maintenance

`ki repo roadmap` MUST prune only completed work records and move one unambiguous record only through valid directional horizon transitions.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `promotes and prunes flat Knowledge Base work items without changing the ledger`, `prunes only completed items across selected repositories after every target is valid`, `promotes and demotes one explicit item with directional horizon validation`, and `rejects ambiguous roadmap identifiers before changing or pruning a work item`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-007 — Repository projection diagnostics

`ki repo diag` MUST report the declared skill and compatible runtime projection health for every selected repository without changing repository or registry state. It MUST return non-zero when any selected repository is unrepairable.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/diag.test.ts` — `reports selected repository projection health without changing it` and `reports an unresolved declared provider as unrepairable`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-008 — Fail-closed rubric activation evidence

When a repository rubric inspects or proposes a declared repository skill, the host MUST expose only its resolved compatible runtime projections. A missing projection is activatable only when every target is absent; a regular entry, dangling link, or link to another source is blocked and MUST remain unchanged. An undeclared skill or a declared skill with no compatible configured runtime is blocked before the rubric can activate it. After publishing an activation, `ki repo conform` MUST re-audit the same selected skills and report only that observed result.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/conform-execution.test.ts` — `activates a proposed declared runtime skill and re-audits it`, `refuses a proposed runtime activation with an unsafe managed-skill entry`, and `reports $title as blocked before a rubric can activate it`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-009 — Conditional conform re-audit

After publishing staged writes or running staged commands, `ki repo conform` MUST re-audit the same selected skills and report that second pass as `re-audit`. When conform stages no operation, it MUST skip that second pass and report that no re-audit is required.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/conform-writes.test.ts` — `does not re-audit a clean conform that staged no operation`, `publishes a complete conform write set, supports dry-run, and re-audits`, and `runs an eligible guarded command only with explicit authority and re-audits it`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-010 — Adapter-owned roadmap metadata

For the `kb-streams` adapter, `ki repo roadmap` MUST project and validate the common work lifecycle fields while accepting additional frontmatter fields, including opaque indented continuations attached to those fields, whose semantics remain owned by native Knowledge Base governance. It MUST continue rejecting missing, malformed, or repeated common fields. Project roadmaps MUST accept exactly the current shared frontmatter fields, including `waiting_on_trades`, terminal intake-disposition fields, `transferred_from`, `housekeeping_template`, `scheduled_for`, and optional `task_links`, while rejecting retired field spellings. Both local adapters MUST validate `task_links` offline as a non-empty map from lower-case provider names to non-empty arrays of references. Each reference MUST contain only non-empty string `authority`, `scope`, `id`, `key`, `url`, and `relation` fields; `relation` MUST be `evaluation`, `implementation`, `review`, `integration`, `coordination`, or `related`. References MUST NOT repeat the same provider, authority, scope, id, and relation tuple within an item. Readable keys and URLs are not identity; the map does not mirror task status or establish current ownership or release.

A KB Streams horizon mutation MUST preserve every unconsumed frontmatter field and body byte except for the requested `horizon` change and monotonic `updated_at` advancement.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `projects adapter-owned KB metadata alongside a strict project roadmap in one selection`, `diagnoses unavailable, malformed, and misconfigured Knowledge Base roadmaps without falling back`, `rejects every malformed canonical frontmatter shape`, and `promotes and prunes flat Knowledge Base work items without changing the ledger`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-011 — Absent roadmap projection

`ki repo roadmap list` MUST treat a selected repository with no physical directory for its declared local roadmap adapter as contributing no roadmap rather than as a diagnostic or non-zero result. It MUST continue reporting malformed, unsafe, unreadable, or misconfigured roadmap evidence as diagnostics that make the command non-zero.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `treats absent Knowledge Base roadmaps as empty but diagnoses malformed and misconfigured ones` and `isolates missing, malformed, invalid-status, and unsafe roadmap entries`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-012 — Aggregate roadmap inventory

With `--aggregate`, `ki repo roadmap list` MUST render one selected-set inventory grouped by local horizon, using each item’s canonical identifier as its identity. It MUST identify selected repositories that contribute no roadmap and MUST NOT imply a shared cross-repository priority order.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `aggregates selected roadmaps while treating absent roots as empty`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-013 — Repository-local self governance

For a selected physical repository that explicitly declares `[skills.ki-self]`, native repository operations MUST resolve only the physical contained `.agents/skills/ki-self/` source as `repository-local:ki-self`, validate its canonical identity and catalogue before import, and exclude it from installed-Harness upgrade and managed runtime projection; every other declared skill MUST continue to require a declared installed Harness provider.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/local-provider.test.ts` — `[ki repo] repository-local ki-self provider`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-014 — Final repository and workspace declarations

`ki` MUST use `.ki.toml` as the only KI repository declaration filename, and without an explicit repository or Agora selector MUST consume only a regular direct-CWD `.mgit.toml`: unversioned workspace manifests select direct members, existing `schema = 1` workspace manifests select their configured group, and both recurse through declared child workspaces. Repository manifests fall through to ordinary repository discovery. It MUST NOT provide retired-filename compatibility or migration behaviour.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts`, `src/tests/cli/repo/targets.test.ts`, and a bounded retired-name search across product and test sources.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-015 — Timestamped roadmap statistics

`ki repo roadmap` MUST require paired `created_at` and `updated_at` canonical UTC-second timestamps on every local work item and advance `updated_at` monotonically on horizon move. `ki repo roadmap stats` MUST report per-repository and selected-set aggregate age, inactivity, and optional not-done-item staleness. Text output MUST label the count of all non-done items `NOT_DONE`, including Triage drafts, and render durations as compact days, hours, minutes, and seconds, omitting zero-valued leading components. The version 2 JSON contract MUST retain its `active` field with this same not-done meaning and exact numeric seconds.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `requires timestamp pairs, advances horizon-move timestamps, and reports statistics`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-016 — Portable triage visibility

`ki repo roadmap list` MUST accept and render the portable `triage` horizon without treating unadopted intake as malformed. Generic horizon promotion and demotion MUST NOT adopt or return an adopted record to Triage outside the planning workflow.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `orders horizons then lifecycle and canonical identifier` and `promotes and demotes one explicit item with directional horizon validation`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-017 — Path-free roadmap projection

`ki repo roadmap list --format json` MUST emit schema `ki/roadmap/v1` with canonical item and repository identities, filters, dependencies, lifecycle fields, and canonical record URLs while omitting local filesystem paths and presentation state. It MUST project validated `task_links` as `taskLinks` only for items that declare the field; older records MUST retain their existing JSON shape. This additive projection is association evidence, not a live task-system check or KI lifecycle state.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `emits versioned path-free JSON for project and Knowledge Base roadmaps` and `keeps absent roadmaps empty and reports unavailable JSON repositories`.

_Evidence:_ The named roadmap contract tests are part of the passing `bun run test:coverage` gate.

### REPO-OPS-018 — Typed repository-store inventory

`ki repo store list` MUST project every store role declared by each selected Knowledge Base. `notes` MUST resolve to the selected repository root; declared external roles MUST report their explicit machine-local binding or `unbound`. JSON output MUST use the versioned `ki/repository-stores/v1` contract.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/store.test.ts` — `lists declared roles with notes bound to the repository root`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-019 — Explicit external-store binding

`ki repo store bind|unbind` MUST operate on exactly one selected repository, refuse undeclared roles and changes to `notes`, preview by default, and publish only with `--write`. Binding MUST require an existing absolute direct directory. Unbinding MUST preserve physical store content and unrelated registry bindings.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/store.test.ts` — `previews, binds, replaces, and non-destructively unbinds external roles` and `fails closed for unsupported roles, unsafe paths, selection, and registry state`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-020 — Managed sources creation

`ki repo store create sources` MUST derive the established opt-in OneDrive `sources-<repository-basename>` location, preview creation and binding by default, and perform both only with `--write`. It MUST refuse unavailable or unsafe managed roots, replacement of a different binding, and automatic creation for `legacy`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/store.test.ts` — `previews and creates the conventional managed sources store without touching VS Code` and `rejects automatic creation without its managed root or over a different binding`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-021 — Mixed mGit workspace audit

With no explicit selector, `ki repo audit` MUST audit selected mGit members with valid KI declarations and report the names of existing physical members skipped because `.ki.toml` is absent, including in concise output. It MUST fail for missing or unsafe checkouts, unsafe or invalid KI declarations, or a workspace with no KI repositories.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/targets.test.ts` — mixed KI and non-KI audit, missing or unsafe checkout, unsafe or invalid declaration, and all-skipped workspace cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-022 — mGit registration locations

`ki repo` MUST accept an optional string-array `locations` field in an unversioned or schema-one mGit workspace manifest without selecting targets from it. A non-array value or non-string entry MUST fail before repository selection.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/targets.test.ts` — `audits KI members and reports skipped non-KI members in both output modes`; `rejects malformed workspace locations before selecting members`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-023 — Readable roadmap task links

Text roadmap inventories, including `--aggregate`, MUST append one compact provider-qualified task key to each linked item's title, preferring an implementation relation and otherwise using stable qualified-identity and relation ordering. A `+N` suffix MUST count additional distinct provider, authority, scope, and task identities, not additional relations. Known provider abbreviations MUST have a legend; other providers MUST retain their names. Unlinked items MUST retain their existing display. Compact suffixes SHOULD be muted on interactive terminals that permit colour.

`--links all` MUST replace the compact suffix with child entries for every mapping, showing provider, readable key, and relation, with the stored task URL on a further indented child line. Distinct tasks with the same provider and readable key MUST expose authority, scope, and task ID on separate child lines. Both modes MUST use local evidence without contacting providers or implying live task status or ownership. `--links` MUST accept only `compact` and `all`, default to `compact`, and leave JSON projection unchanged.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `lists compact task keys and expands nested task URLs in both roadmap views`, `counts distinct qualified tickets while retaining every relation and provider in expanded links`, `qualifies task keys from different instances or scopes only in expanded output`, and `mutes compact task suffixes only on colour-capable terminals`.

_Evidence:_ The named in-process CLI tests exercise compact and expanded inventories, qualified identities, relation counts, terminal output, option validation, and unchanged JSON evidence with a sandbox that rejects network access.

### REPO-OPS-024 — Compact roadmap summary

`ki repo roadmap summary` MUST report the count of valid work items per selected repository and the nonzero breakdown by horizon and lifecycle status without listing item identifiers or titles. It MUST distinguish an absent roadmap from a present empty roadmap. Invalid roadmap evidence MUST remain diagnostic and make the command exit nonzero; trade inventory MUST NOT affect the roadmap summary.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `summarizes selected roadmaps without listing records or reading trades` and `summarizes valid items but diagnoses malformed roadmap records`.

_Evidence:_ The named in-process CLI tests cover selected Knowledge Base roadmaps, absent and empty directories, count breakdowns, invalid records, and independence from trade evidence without network access.

### REPO-OPS-025 — Undeclared conventional sources

`ki repo store scan` MUST inspect selected repositories for existing direct conventional OneDrive source directories without a declared `sources` store role. It MUST use the normal `ki repo` selectors, including `--estate` for all registered repositories, name the repository kind, and present an explicit declaration, migration, or retirement decision without changing any directory, declaration, or binding. Undeclared directories MUST be warnings with exit zero; unsafe store paths and unreadable declarations MUST be diagnostics with a nonzero exit. Invalid repository selection MUST fail before scanning.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/store-scan.test.ts` — `warns about undeclared direct source stores without changing the registry or directories`, `scans the current repository and explicit selection without requiring registration`, and `reports unsafe and unavailable conventional source-store evidence separately`.

_Evidence:_ The named in-process CLI tests cover current, explicit, and estate selection; Projects and Knowledge Bases; declared and absent stores; unchanged files; unsafe paths; and warning versus diagnostic exit status without network access.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
