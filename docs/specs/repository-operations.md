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

`ki repo repair` MUST register the selected physical root before repairing a missing compatible repository projection. It MUST remove a dangling undeclared `ki-` projection link that `ki repo diag` reports, and `--dry-run` MUST only preview that removal.

`ki repo repair --dry-run` and `ki registry add --dry-run` MUST NOT create a missing XDG state directory merely to preview registration. Without `--dry-run`, both commands apply their writes by default; repository store mutations and VS Code sync instead preview by default until `--write` is supplied.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repair.test.ts` — `registers the selected physical root before repairing a missing compatible projection` and `previews and then removes a dangling undeclared ki- link`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-004 — Declared provider upgrades

`ki repo upgrade` MUST upgrade the uniquely resolved providers declared by the selected repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/update.test.ts` — `upgrades the uniquely resolved providers declared by the current repository`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-005 — Governed roadmap inventory

`ki repo roadmap list` MUST resolve repository type from `[skills.ki-repo]` and render flat work items from the selected local adapter: `docs/roadmap/` for a project roadmap or `Streams/Roadmap/` for KB Streams, with the colocated ledger, `_index.md` or `_ISSUES.md`, its name until each repository renames it, and KB `Roadmap.md` navigation note treated as adapter-owned surfaces rather than work items. A record MAY carry the authoring standard's `ki-document-type` field with a value in either adapter, which the listing MUST read past and MUST NOT warn of as an unknown KB Streams field.

`--horizon` MUST accept only governed horizons, as a comma-separated list or a repeated flag, and `--status` MUST accept only the five governed lifecycle states. An unsupported filter or output format MUST fail with a grammar error before repository inventory is read.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `lists flat Knowledge Base work items from the declared Streams roadmap and ignores its ledger`, `lists and filters grouped governed work items without JSON output`, `reads past the renamed _index.md ledger and a record’s ki-document-type`, and `warns on each unknown KB Streams record field without changing the exit status`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-006 — Guarded roadmap maintenance

`ki repo roadmap` MUST prune only completed work records and move one unambiguous record only through valid directional horizon transitions.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `promotes and prunes flat Knowledge Base work items without changing the ledger`, `prunes only completed items across selected repositories after every target is valid`, `promotes and demotes one explicit item with directional horizon validation`, and `rejects ambiguous roadmap identifiers before changing or pruning a work item`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-007 — Repository projection diagnostics

`ki repo diag` MUST report the declared skill and compatible runtime projection health for every selected repository without changing repository or registry state. It MUST return non-zero when any selected repository is unrepairable. It MUST also report every dangling `ki-` link in a compatible projection directory that no declared skill accounts for, and treat it as repairable; other entries are not KI's to report.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/diag.test.ts` — `reports selected repository projection health without changing it`, `reports an unresolved declared provider as unrepairable`, and `reports dangling undeclared ki- links and ignores entries KI does not own`.

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

For the `kb-streams` adapter, `ki repo roadmap` MUST project and validate the common work lifecycle fields while accepting additional frontmatter fields, including opaque indented continuations attached to those fields, whose semantics remain owned by native Knowledge Base governance. It MUST continue rejecting missing, malformed, or repeated common fields. Project roadmaps MUST accept exactly the current shared frontmatter fields, including terminal intake-disposition fields, `transferred_from`, `housekeeping_template`, `scheduled_for`, and optional `task_links`, while rejecting retired field spellings. Both local adapters MUST validate `task_links` offline as a non-empty map from lower-case provider names to non-empty arrays of references. Each reference MUST contain only non-empty string `authority`, `scope`, `id`, `key`, `url`, and `relation` fields; `relation` MUST be `evaluation`, `implementation`, `review`, `integration`, `coordination`, or `related`. References MUST NOT repeat the same provider, authority, scope, id, and relation tuple within an item. Readable keys and URLs are not identity; the map does not mirror task status or establish current ownership or release.

A KB Streams horizon mutation MUST preserve every unconsumed frontmatter field and body byte except for the requested `horizon` change and monotonic `updated_at` advancement.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `projects adapter-owned KB metadata alongside a strict project roadmap in one selection`, `diagnoses unavailable, malformed, and misconfigured Knowledge Base roadmaps without falling back`, `rejects every malformed canonical frontmatter shape`, and `promotes and prunes flat Knowledge Base work items without changing the ledger`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-011 — Absent roadmap projection

`ki repo roadmap list` and identifier-free `ki repo roadmap prune` MUST treat a selected repository with no physical directory for its declared local roadmap adapter as contributing no roadmap rather than as a diagnostic or non-zero result. They MUST continue reporting malformed, unsafe, unreadable, or misconfigured roadmap evidence as diagnostics that make the command non-zero. A work-item identifier held by more than one record MUST be such a diagnostic for every record that holds it, naming the other holders, and none of those records MUST be listed. Pruning one explicit identifier still requires the selected repository's roadmap directory.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `treats absent Knowledge Base roadmaps as empty but diagnoses malformed and misconfigured ones`, `isolates missing, malformed, invalid-status, and unsafe roadmap entries`, `diagnoses records without frontmatter and shared identifiers in both local adapters`, and `prunes only completed items across selected repositories after every target is valid`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-012 — Aggregate roadmap inventory

With `--aggregate`, `ki repo roadmap list` MUST render one selected-set inventory grouped by local horizon, using each item’s canonical identifier as its identity. It MUST identify selected repositories that contribute no roadmap and MUST NOT imply a shared cross-repository priority order: it MUST keep each repository's records together within a lane, so `priority` orders records only inside one repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `aggregates selected roadmaps while treating absent roots as empty`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-013 — Repository-local self governance

For a selected physical repository that explicitly declares `[skills.ki-self]`, native repository operations MUST resolve only the physical contained `.agents/skills/ki-self/` source as `repository-local:ki-self`, validate its canonical identity and catalogue before import, and exclude it from installed-Backpack upgrade and managed runtime projection; every other declared skill MUST continue to require a declared installed backpack provider.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/local-provider.test.ts` — `[ki repo] repository-local ki-self provider`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-014 — Final repository and workspace declarations

`ki` MUST use `.ki.toml` as the only KI repository declaration filename, and without an explicit repository or Territory selector MUST consume only a regular direct-CWD `.mgit.toml`: unversioned workspace manifests select direct members, existing `schema = 1` workspace manifests select their configured group, and both recurse through declared child workspaces. Repository manifests fall through to ordinary repository discovery. It MUST NOT provide retired-filename compatibility or migration behaviour.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/repo.test.ts`, `src/tests/cli/repo/targets.test.ts`, and a bounded retired-name search across product and test sources.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-015 — Timestamped roadmap statistics

`ki repo roadmap` MUST require paired `created_at` and `updated_at` canonical UTC-second timestamps on every local work item and advance `updated_at` monotonically on horizon move. `ki repo roadmap stats` MUST report per-repository and selected-set aggregate age, inactivity, and optional not-done-item staleness. Text output MUST label the count of all non-done items `NOT_DONE`, including Triage drafts, and render durations as compact days, hours, minutes, and seconds, omitting zero-valued leading components. The version 1 JSON contract MUST retain its `active` field with this same not-done meaning and exact numeric seconds.

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

`ki repo store create sources` MUST derive the opt-in OneDrive `sources-<territory-code>/<repository-basename>` location, preview creation and binding by default, and perform both only with `--write`, creating the territory folder when it is absent. The territory code MUST be the name of the folder that holds the checkout, the `~/kis/<territory-code>/<repository>` convention, for every repository, Capital or not (SOURCES-LAYOUT a). It MUST refuse unavailable or unsafe managed roots, a territory folder that is a symbolic link or not a directory, replacement of a different binding, and automatic creation for `legacy`. Malformed Capital territory metadata MUST fail. A territory alias MUST NOT name a store.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/store.test.ts` — `previews and creates the conventional managed sources store without touching VS Code`, `rejects automatic creation without its managed root or over a different binding` and `rejects an unsafe managed sources target or territory folder`; `src/tests/cli/repo/store-capital.test.ts` — `creates a Capital store under its territory code and basename, whichever selector chose it` and `creates a store for a prefixless, unregistered Capital by its territory code like any repository`.

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

`ki repo roadmap summary` MUST show selected repositories as rows against horizon columns, with nonzero lifecycle-status counts and a `Σ` total in each populated cell, without listing item identifiers or titles. Status counts MUST use `d` for draft, `r` for ready, `ip` for in-progress, `ar` for awaiting-review, and `x` for done, with a legend for abbreviations. A `Σ` column and row MUST aggregate the same counts per repository and per horizon, with a grand total at their intersection. Empty cells MUST show `—`, including empty totals, while unavailable roadmap cells MUST show `?`. Repositories without a roadmap MUST be named below the table to distinguish absent roadmaps from present empty roadmaps. Invalid roadmap evidence MUST remain diagnostic and make the command exit nonzero; With `--by project`, `--by theme` or `--by area`, rows MUST be the groups aggregated across the selected set instead of repositories.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `summarizes selected roadmaps without listing records` and `summarizes valid items but diagnoses malformed roadmap records`.

_Evidence:_ The named in-process CLI tests cover the horizon matrix and totals, lifecycle counts, selected Knowledge Base roadmaps, absent and empty directories, and invalid records without network access.

### REPO-OPS-025 — Undeclared conventional sources

`ki repo store scan` MUST inspect selected repositories for existing direct conventional OneDrive source directories without a declared `sources` store role. It MUST use the normal `ki repo` selectors, including `--estate` for all registered repositories, name the repository kind, and present an explicit declaration, migration, or retirement decision without changing any directory, declaration, or binding. Undeclared directories MUST be warnings with exit zero; unsafe store paths, unreadable declarations and malformed Capital territory metadata MUST be diagnostics with a nonzero exit. It MUST inspect the current [REPO-OPS-020](#repo-ops-020--managed-sources-creation) name first, then the fallback names of the layout before it: for a territory Capital its canonical territory handle (`territory_prefix`, else its registry key), then for every repository its basename, which also finds a purpose store such as `sources-inbox` for the `inbox` repository. It MUST report a directory once when names are equal, MUST NOT take a fallback name equal to the territory code, which names the territory folder, and MUST diagnose a territory folder that is not a direct directory. Invalid repository selection MUST fail before scanning.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/store-scan.test.ts` — `warns about undeclared direct source stores without changing the registry or directories`, `finds the current layout first, then a purpose store by basename, but never the territory folder`, `diagnoses a linked territory folder in the current layout`, `scans the current repository and explicit selection without requiring registration`, and `reports unsafe and unavailable conventional source-store evidence separately`; `src/tests/cli/repo/store-capital.test.ts` — `scans canonical and historical Capital store names, reporting an equal name once` and `diagnoses malformed Capital naming metadata without hiding other repositories`.

_Evidence:_ The named in-process CLI tests cover current, explicit, and estate selection; Projects and Knowledge Bases; declared and absent stores; unchanged files; unsafe paths; and warning versus diagnostic exit status without network access.

### REPO-OPS-026 — Declared roadmap adapter

`ki repo roadmap` and `ki batch` MUST resolve a repository's local roadmap only from its declared `[skills.ki-work].adapter` and the matching adapter table: `roadmap` with `[skills.ki-work-roadmap]` in a Project selects `docs/roadmap/`, and `kb-streams` with `[skills.ki-work-roadmap]` in a Knowledge Base selects `Streams/Roadmap/`. They MUST NOT infer a roadmap from a directory. A repository without `[skills.ki-work]`, or one declaring the remote `linear` adapter, MUST contribute no local roadmap to listing, statistics, and identifier-free pruning, and MUST fail an operation on one explicit work item. The retired `github-issues` adapter MUST be a diagnostic naming `ki-work-linear` and the local `roadmap` adapter as its replacements. An unknown adapter, an adapter inapplicable to the repository kind, or a missing adapter table MUST be a diagnostic that makes the command non-zero.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `resolves roadmaps only from the declared work adapter and its adapter table` and `treats absent Knowledge Base roadmaps as empty but diagnoses malformed and misconfigured ones`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-027 — Committed roadmap pruning

`ki repo roadmap prune` MUST, by default, give each selected repository with records to prune exactly one commit that removes exactly those record paths, with the subject `chore(roadmap): prune <N> done work record(s)` and one `- <ID>` body line per record in identifier order, and MUST run the repository's commit hooks. Before deleting anything in any selected repository, it MUST refuse when a repository is not a Git work tree, has staged changes, or holds a selected record that is untracked or modified, and it MUST NOT stage or commit any other path. It MUST re-check the index immediately before deleting a repository's records, a commit that fails MUST restore that repository's records, and a commit that a hook widened beyond the record deletions MUST be reported as an error naming the extra paths. `--no-commit` MUST only delete the records, without the Git checks, and `--dry-run` MUST make the same selection and checks and report the records and planned commit messages without deleting or committing.

`--standing` MUST keep only the terminal records the standing prune (PRUNE-RECORDS a) makes due: the commit that first recorded the present `done` or `cancelled` state is at least 7 days old, and that commit and every commit of the repository the record names are ancestors of the upstream default branch, `origin/HEAD`, else `origin/main` or `origin/master`, without fetching. It MUST leave every other terminal record in place and report it on a `not due` line with its reason, MUST be refused with an identifier, and MUST NOT change a record's lifecycle status.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `prunes under --standing only records terminal for 7 days whose commits have landed upstream`, `commits exactly the pruned records with the standardised message and runs commit hooks`, `commits each selected repository separately and names one record in the singular`, `refuses before deleting anything when a repository cannot take a clean prune commit`, `previews a prune and its commit with --dry-run without changing either repository`, `restores the records when a commit hook rejects the prune`, `restores the records and names earlier commits when the runner throws during a commit`, `refuses a change staged by an earlier repository hook and reports a commit a hook widened`, and `commits Knowledge Base records with spaced names and a repository nested in a larger work tree`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-028 — Read-only work status

`ki work status` MUST read the work packages of the Cairn store, `work/<territory>/<id>/` under the `ki-work-package` standard, and each sub-package folder of the same shape inside its parent, without changing anything, reading only each package's `_index.md` front matter and the names of its `*.change.md` change documents, and never `work-legacy/` or a repository's `+/_WORK/`. The store MUST be `--store`, then `MCP_CAIRN_STORE`, then `[store] path` in the rig's `cairn/config.toml`, and none MUST be an error. By default it MUST list the packages whose `ki-repositories` names the selected repository, the working directory's or `--repo`'s, and with `--all` every package, refusing `--all` with `--repo`. It MUST take each sub-package's id as `<parent id>+<folder>`, require its `ki-id` to agree with its folder and its `ki-parent` to name the enclosing package, and validate `ki-level`, `ki-state`, `ki-since`, `ki-hold.reason`, `ki-repositories` and `ki-records`; it MUST report a package that fails, or a top-level folder without `_index.md`, as a warning while listing the rest, and MUST warn of, but keep, a `ki-parent` that names no package, leaves its territory or closes a cycle. It MUST derive each entry's holder and role from its state, never from a stored field, and place every unfinished entry in the with-you, stuck, blocked, moving and on-hold views. `--format json` MUST emit schema `ki/work-status/v2`, with the store, the repository identity or null, generation time and one entry per listed package, each carrying its level, parent, repositories, records, state, hold, holder, `description`, `method_read`, workers, entry `path` and `changes`, and MUST write its warnings to standard error. `--view routing` MUST replace the five views with one line per unfinished package, its id, state and routing description cut to one line, or `no description`, and `--view tree` MUST place the listed packages in their work tree by `ki-parent`, naming their unlisted ancestors for context; any other view MUST be rejected.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/work/status.test.ts` — `reads the packages naming the repository from the Cairn store into ki/work-status/v2 and its views`, `lists every package with --all, flags a silent worker as stuck, and reads the working directory by default`, `lists each unfinished package for routing, and places the listed packages in their work tree`, `warns of each unreadable package and each parent that names none, leaves its territory or closes a cycle`, and `reads the store --store names, and refuses an unknown form or --all with --repo`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-029 — Priority and size fields

`ki repo roadmap list` MUST accept the optional `priority` (`high`, `medium` or `low`) and `size` (`s`, `m`, `l` or `xl`) record fields in both local adapters, MUST reject any other value and a `ready` record of size `xl` as unreadable, and MUST NOT warn of either as an unknown KB Streams field. Within each lane, text output MUST order open records unblocked first, then by priority with unset as `medium`, then by size smallest first with unsized last; priority MUST NOT cross lanes. Through the field migration window it MUST list each open record's field gaps in the backpack roadmap checker's wording, MUST exempt done and cancelled records from the `size` and `kind` gaps, MUST count them in `GAPS=`, and MUST NOT change the exit status for a gap. The JSON projection MUST add `priority`, `size` and `gaps` to every item.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `accepts priority and size and orders each lane by holds, priority, then size`, `rejects invalid priority and size values and an extra-large ready record`, `lists each migration-window gap and exempts closed records`, and `warns on each unknown KB Streams record field without changing the exit status`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-030 — Commit message check

`ki git check-message <file>` MUST check the commit message file Git passes to `commit-msg` against the deterministic `ki-git` rules without reading configuration or changing state. It MUST ignore every line from the scissors line onward and every line starting with `#`, and take the first remaining non-blank line as the header. It MUST pass a Git-generated merge, revert, reapply or autosquash header. Otherwise it MUST require a `type(scope)!: subject` header with optional scope and `!`, a type of `chore`, `docs`, `feat`, `fix`, `refactor` or `test`, lowercase kebab-case scope segments, and a non-empty subject with no terminal full stop. A pass MUST print nothing and exit 0; a failure, including an unreadable file, MUST exit 1 naming the rule and reason, with the remedy on a `next:` line where one exists.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/git/check-message.test.ts` — `passes %j silently`, `rejects %j naming the rule and remedy`, `ignores comment lines, leading blank lines and everything from the scissors line`, `passes the Git-generated header %j`, and `refuses a missing message file, naming its path`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-031 — Assignee field

`ki repo roadmap list` MUST accept the optional `assignee` record field in both local adapters, holding one work-model holder value: `owner`, `work/<id>`, `run/<name>`, `person/<handle>` or `repo/<name>`. It MUST reject any other value as unreadable and MUST NOT warn of the field as an unknown KB Streams field. Text output MUST show each record's assignee after its size. `--assignee <holder>` MUST keep only records with that assignee, `--assignee none` only records without one, and any other value MUST be a usage error. Through the backpack roadmap standard's assignee window it MUST list an open record without an assignee as a gap in the backpack roadmap checker's wording, MUST exempt done and cancelled records, and MUST NOT change the exit status for it. The JSON projection MUST add `assignee`, `null` when unset, to every item. The lock on an in-progress record's assignee is the backpack roadmap checker's audit, not a listing concern.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/roadmap.test.ts` — `shows each assignee, filters by it, and rejects a value outside the holder vocabulary`, `rejects an assignee outside the holder vocabulary in a record`, and `accepts priority and size and orders each lane by holds, priority, then size`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REPO-OPS-032 — Change-document base check

`ki work base` MUST read, without fetching or changing anything, the `*.change.md` change documents of every package in the Cairn store, found as `ki work status` finds them, or only those of the packages whose `ki-repositories` names the repository `--repo` names, and MUST list a document whose `ki-status` is `done` or `replaced` as closed, unchecked. For each other document it MUST check each `ki-inputs` entry against its version ref: a repository, `<org>/<repo>@<ref>`, or a path in one, `<org>/<repo>:<path>@<ref>` with `*`, `**` and `?` wildcards, resolved in the local registry by identity, MUST be moved, naming each matching file `git diff --name-status --find-renames` shows modified, added, deleted or renamed between the ref and that checkout's `origin/main`, or current when none moved; a store file, `<file>@<ref>`, resolved beside the document and then from the store root, MUST be moved when its `ki-revised` is later than a date ref, a date alone reading as the end of that day, or when Git shows it changed between a commit ref and the store's `origin/main`. An input MUST be unknown, with its reason and never a pass, when it has no ref, its repository is unregistered, its checkout has no `origin/main`, the ref is missing or not on `origin/main`, a repository input's ref is a date, a store file is absent or has no `ki-revised` to compare with, or a store ref is neither a commit nor a date; a URL MUST be unchecked. A document MUST be moved when any input moved, else unknown when any input is unknown, when it has no `ki-inputs`, or when no input can be checked, else current. It MUST exit 0 when every checked document is current and 1 otherwise, and `--format json` MUST write the versioned `ki/work-base/v2` report.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/work/base.test.ts` — `checks each ki-inputs entry of the store’s change documents against its version ref, skipping the closed`, `renders the text report, exiting 1 when any document is moved or unknown and 0 when all are current`, and `reads only the packages naming the repository --repo names, and warns of an unreadable package`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
