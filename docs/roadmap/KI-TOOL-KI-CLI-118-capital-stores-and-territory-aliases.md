---
id: KI-TOOL-KI-CLI-118
area: CLI
title: Capital stores and aliases
kind: deliver
purpose: capability
project: estate-factorisation
component: territory
status: done
blocks: []
blocked_by: []
baseline_ref: fe3c4bcfaf6961ad3c4b7ab17504ce654642fb4d
created_at: 2026-10-11T11:12:48Z
updated_at: 2026-10-12T07:23:00Z
---

# Capital Stores and Aliases

## Goal

New Capital source stores follow their territory's canonical handle. Owners can select territories through explicitly declared aliases while displayed identity, membership and repository names remain stable.

## Context

Tools-burndown Decision 8, originating Master Decision 51 on 11 October 2026, authorises exactly one combined capture, adoption and planning pass. Kris must see and approve this plan before delivery. Decision 6's closure grant does not apply; Decision 7 adds the tap to the sweep but creates no tap work. Only this agent writes tools-ki in the primary main checkout. The two existing records concern unrelated protected host behaviour and do not own this outcome.

The record belongs to estate-factorisation; its existing Project registry derives platform-foundations as the Initiative, so no redundant initiative field or new Project is created. This multi-step outcome must survive the delegated session and passes the capture graduation test. Decision 8 selects it into Next for planning; that selection grants no Ready transition or delivery authority.

The inspected baseline is tools-ki main at `3e926e9`, version 0.10.1, fetched and fast-forward checked clean. Master baseline-fixes already updated selector examples in the user guide and most README examples. Inspect remaining prose rather than reapplying the old documentation sweep: README's handle explanation still gives `ki` as the prefix example.

## Boundary

- **In after approval:** Capital-aware managed sources naming, read-only conventional scan compatibility, optional Capital aliases, shared selector resolution, tools-ki behavioural specifications, public documentation and sandbox CLI evidence.
- **Out now and during this delivery:** live OneDrive renames or migration; live source-store creation, binding or unbinding; credentials; registry, runtime trust, chezmoi or machine configuration; any real Capital `.ki.toml` edit; repository renames; protected host records; other capture, acceptance, pruning or release.
- **External authority:** Harness-owned metadata governance and Arcadia-owned decision updates need their owners. This record proposes their exact changes but grants no writes in those repositories or direct edits to vendored skill sources.

## Spec refs

- [Managed sources creation](../specs/repository-operations.md#repo-ops-020--managed-sources-creation), REPO-OPS-020, currently requires repository-basename naming.
- [Undeclared conventional sources](../specs/repository-operations.md#repo-ops-025--undeclared-conventional-sources), REPO-OPS-025, requires read-only scanning and separate warning/diagnostic exits.
- [Store inventory and binding](../specs/repository-operations.md#repo-ops-018--typed-repository-store-inventory), REPO-OPS-018/019, preserve declared roles, explicit local bindings and preview/write separation.
- [Territory selection](../specs/repository-audit.md#repo-audit-009--registered-estate-selector), REPO-AUDIT-009, and [registry selector contract](../specs/registry.md#registry-004--registered-estate-selector), REGISTRY-004, preserve existing selector conflicts, filtering and registration checks.
- The `ki-repo` governance skill owns Capital metadata and TERR-2/TERR-3 validation. Its current configuration standard still describes a single prefix/fallback handle and no implicit registry-key alias. The accepted [territory-selection decision](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/Admin/Governance/Decisions/ADR-KI-PRINCIPAL-002-territory-derived-repository-selection.md) predates Master's renamed handles and optional aliases; its owner must reconcile that policy before rollout.

## Current state

[Store command selection](../../src/commands/repo/store.ts) reads repository identity and store roles, then passes only the repository root to managed creation. [Store naming and scanning](../../src/core/storage/repository-stores.ts) always use `sources-${basename(root)}` and scan that path before reading the declaration. Scan suppresses findings when the repository declares the sources role; it does not audit an existing binding or discover arbitrary directories.

[Territory declarations](../../src/core/territory/declaration.ts) recognise a Capital by canonical `repository === capital`, require name and sorted self-inclusive membership, and validate optional `territory_prefix` as a lower-case hyphenated identifier. [Territory resolution](../../src/core/territory/resolution.ts) discovers registered Capitals, uses `territory_prefix ?? registry.key` as the handle, and rejects duplicate handles globally before selection. An explicit prefix replaces the key as selector. Both `resolveTerritory` and `resolveTerritoryCapital` currently match handles only.

The common resolver serves territory show/roots/audit/open/inspect, repository operations, registry add and trade commands through repository selection. Project registry lookup also uses `resolveTerritoryCapital`; preserve canonical Project identity when resolving its Capital. No command-specific alias table is needed.

[Store inventory](../../src/core/storage/repository-stores.ts), [external roots](../../src/core/storage/local-stores.ts), repo open/repair and [KB authority](../../src/core/kb/authority.ts) use explicit repository registry bindings. No Capital-to-member inherited source-store lookup exists in these paths. Preserve those lookups; add no inheritance or arbitrary-binding scan. An inherited selector still selects the repository whose declaration owns naming, rather than borrowing its Capital's store name.

## Plan

### Managed names and compatible scan

Recognise Capital status from validated canonical identity equality, never directory suffix, repository kind, registry key spelling or a user-supplied alias. For a Capital with valid `territory_prefix`, creation derives `sources-<territory_prefix>` below the existing opt-in OneDrive-Personal root. Non-Capitals keep `sources-<repository-basename>`, even when selected through an alias. Store naming never uses an alias or the human territory title.

**Prefixless Capital choice for Kris:** recommend using the existing canonical selector fallback, the uniquely registered Capital's key, when no prefix is declared. This makes Capital names consistently `sources-<canonical handle>`. A prefixless, unregistered Capital cannot establish that handle: fail managed create before any write with an actionable register-or-declare-prefix diagnostic. A prefixed unregistered Capital continues to work under direct/current selection. The alternative is retaining repository-basename creation for prefixless Capitals, which changes less but makes Capital naming differ from its canonical selector; do not silently choose that alternative during delivery.

Preserve the sources-role requirement, exactly-one mutation target, direct-directory and OneDrive-parent checks, previews by default and the existing refusal to replace a different binding. A previously bound historical Capital directory remains authoritative for list/open/repair; create refuses to replace it even when the newly derived path differs. Do not auto-rebind or rename it.

Scan reads and validates the selected declaration before deriving candidates, then examines the canonical Capital convention and its historical `sources-<repository-basename>` convention in that order. Non-Capitals have only their existing candidate. Deduplicate equal paths; if both distinct Capital directories exist, report both independently without choosing a binding or treating them as selector ambiguity. A prefixless unregistered Capital retains historical-basename scanning without requiring registration merely to inspect it; it has no additional canonical candidate. Do not turn scan into binding or migration inventory: declared sources roles still suppress undeclared warnings, and custom/inherited bindings are not additional candidates.

Keep scan read-only, deterministic and restricted to conventional direct directories. Missing candidates are normal; unsafe candidates or malformed naming metadata produce diagnostics/nonzero, while undeclared valid directories remain warnings/zero. Recheck repository/declaration safety after path inspection, preserving the current race guards when changing discovery order. Retaining historical scan names is a bounded read-only compatibility exception proposed for Kris's approval, not a legacy creation mode. No speculative names based on retired prefixes or old aliases are added.

### Exact optional metadata and lookup

Propose `[skills.ki-repo].territory_aliases` as an optional TOML array of strings on Capitals only. Absence or `[]` means no aliases. Each value uses the existing handle grammar `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`; reject non-arrays, non-strings, empty or whitespace-padded values, uppercase/underscore values and repeats. Array ordering carries no meaning and need not be sorted. Any occurrence on a non-Capital, even `[]`, is invalid. The only currently approved real declaration proposal is `territory_aliases = ["ki"]` alongside `territory_prefix = "knowledge-islands"` in Arcadia; its owner applies it later, outside this delivery.

Build one validated namespace across all discovered registered Capitals containing their canonical handles, including registry-key fallback handles, plus explicitly declared aliases. Reject alias/alias, alias/handle and existing handle/handle collisions, including an alias equal to its own Capital's handle. Do not prefer canonical matches, first registry order, case folding, basename inference, hard-coded `ki`, or a prefixed Capital's registry key. Diagnostics identify the conflicting token and Capitals. Validate all candidates before filters or output; an unused collision still fails safely, including list and estate discovery, with no partial roots or side effects.

Both resolver entry points use the same canonical lookup. Existing `-t/--territory <handle>` accepts a handle or declared alias wherever the selector is already supported; add no command, selector flag or retired Agora grammar. Unsupported selector positions remain errors. Preserve all scope-conflict, membership completeness, physical-root, filter and identity checks. Qualified Project/Initiative references should continue to be authored with canonical handles; alias resolution must not create a second Project namespace.

`TerritoryProfile.id`, territory list/show labels, JSON identities, projections, member URLs and store names remain canonical handles/identities. Keep existing output schemas unchanged: no alias-list output or schema version bump is needed for this input-only addition. Removing an alias stops accepting that spelling without changing persisted canonical output. Old binaries do not gain alias support; no versionless inference or configuration migration is proposed. Other masters' proposed aliases are owner choices, so use synthetic `sample-team`/`demo` fixtures; do not configure their Capitals or imply approval of hnr/er/va/tmx.

## Steps

- [x] Obtain Kris's approval of the plan and both compatibility choices and record it (see Approval). External owner agreement is not a precondition for the tools-ki side; it is carried as remaining work.
- [x] Add the optional aliases value to the core Capital declaration type/validator; build one reusable collision-checked lookup for both resolver entry points. Keep canonical profile/list output and selected repository identities unchanged.
- [x] Pass validated Capital naming context into managed creation and scanner candidate derivation; preserve non-Capital naming, explicit bindings, preview/write checks and scanner role suppression. Implement the approved prefixless rule and canonical-plus-historical deduplication.
- [x] Extend public sandbox CLI tests for aliases, validation, collisions, selector coverage, naming and scan safety. Use only fixture Capitals and fixture OneDrive roots; never call a live store operation.
- [x] Update tools-ki specifications, README, territory-selection guide and manual/help wording where it describes the single-handle rule. Reconcile Harness-owned governance through its owner rather than changing a vendored copy. Inspect current docs and leave prior Master corrections intact.
- [x] Run focused CLI suites, 100% coverage and relevant governance/documentation checks; review the diff against the approved boundary. Commit only intended verified paths with hooks and co-author trailer. Publish only when explicitly authorised, then return the delivery review packet for human acceptance; no self-acceptance or release.

## Files touched

Delivery paths are recorded in Review. No Capital configuration, protected record, sibling repository or runtime-state path changed.

## Verify

Planning gates: `ki repo audit --skill ki-work --repo .`, `ki repo audit --skill ki-work-roadmap --repo .`, `ki repo audit --skill ki-trades --repo .`, `ki repo audit --skill ki-authoring --repo .`, focused `rumdl check`, `git diff --check`, parsed identity/classification/timestamp checks and protected-path equality. Manually assess roadmap readiness and authoring judgments; Ready followed the recorded approval, not the mechanical checks alone.

Delivery gates after approval: `bun run test -- src/tests/cli/territory src/tests/cli/repo/store.test.ts src/tests/cli/repo/store-scan.test.ts src/tests/cli/repo/targets.test.ts src/tests/cli/repo/roadmap.test.ts src/tests/cli/registry`, then `bun run test:coverage`, relevant `ki-self`/engineering/repository audits, authored-document audit and `bun run ki:tools:lint-man` if the manual changes. Assert behaviour through `run(args, context)` and `sandbox()` with injected roots, streams and network; never add tests of private implementation structure or contact a network.

Required observable cases:

- Prefixed Capital preview/create uses the canonical territory store; fixture alias selection yields the same path. Preview creates/binds nothing, fixture write creates and binds once, and existing matching stores stay idempotent. Non-Capital naming and legacy-role refusal stay unchanged.
- Approved prefixless registered/unregistered rules, malformed Capital metadata, missing/linked OneDrive parent, file/symlink store, identity mismatch, different existing binding and exactly-one mutation selection all fail or preserve state as specified.
- Scan detects canonical-only, historical-only and both directories; equal candidate paths appear once; missing paths are silent; notes-only KB and Project warnings retain kind/exit zero; declared sources suppression, direct/CWD/unregistered selection and all unsafe/race diagnostics retain their contracts. Snapshot declarations, registry and directories to prove no scan mutation.
- Absent/empty/one/multiple aliases; invalid types and spelling; non-Capital aliases; duplicate local/cross-Capital aliases; alias collision with explicit/fallback/self handle; invalid unused Capital before filtering; duplicate registered identity and unavailable selected membership. Assert no partial roots or operation effects on failure.
- Handle and alias selection produce equal canonical text/JSON/roots across territory commands, repo operations, registry add, trade selection and qualified Project Capital lookup. Cover both short and long selector flags, filters, estate/scope conflicts, unchanged prefix/key fallback semantics and no implicit registry-key or retired Agora alias. Fixture `ki` resolves to `knowledge-islands`; all other alias cases use synthetic names.

## Dependencies / blocks

No local build-order dependency exists, and protected host records remain untouched. Decision 114 grants delivery authority. Owner agreement on the Harness-owned TERR-2/TERR-3 alias contract and the accepted territory decision's revised naming policy is remaining external work, not a tools-ki precondition; do not claim tooling validation parity before that contract exists. The coordinator routes that agreement without this task capturing or editing external work.

## Delegation

The original planning run under tools-burndown Decision 8 produced the Draft. Delivery under Decision 114 is one exclusive tools-ki writer with no subagents or delegated lanes; it owns the CLI and coverage verification and the review packet.

## Documentation impact

### Decision Records

Arcadia owns reconciliation of the accepted territory-selection rationale with Master Decision 51, optional aliases and the approved compatibility policy. No Decision Record is authored by this tools-ki planning pass; delivery must cite the owner's durable approval.

### Specifications

Revise REPO-OPS-020 and REPO-OPS-025 for Capital naming and historical scan candidates, and territory/registry selection requirements for alias inputs and canonical outputs. Update conformance evidence only after the relevant CLI tests pass. Harness-owned metadata validation needs owner-controlled agreement and publication, not an unapproved vendored edit.

### Guides

Update current README and territory-selection guidance to explain canonical handles, explicit optional aliases and historical read-only scan discovery; clarify that creation does not migrate a different binding. Keep the Master's existing knowledge-islands examples and historical provenance intact.

### Roadmap

Promoted to Now and Ready under Decision 114; delivery stops at Awaiting review. No second item, external capture, protected-record change, acceptance or prune is included.

## Review

### Delivered

A territory Capital may declare `territory_aliases`, an optional array of distinct lower-case hyphenated identifiers. Each alias selects the territory exactly as its canonical handle does wherever `-t, --territory` is accepted (`ki territory`, `ki repo`, `ki registry` and the commands built on repository selection). Handles and aliases share one namespace across every registered Capital; any collision, including an alias equal to its own handle, fails every territory command before selection. Output, `ki territory list`, the ranking and selected identities stay canonical.

`ki repo store create sources` now names a Capital's store `sources-<canonical handle>` (`territory_prefix`, else the registry key) whichever selector chose it, and refuses a prefixless, unregistered Capital with a register-or-declare-prefix error. Non-Capital naming is unchanged. `ki repo store scan` checks a Capital under its canonical and historical basename names, reports an equal name once, and turns malformed Capital territory metadata into a diagnostic.

### Change Summary

- `src/core/territory/declaration.ts` validates `territory_aliases` on Capitals only; `src/core/territory/resolution.ts` builds one collision-checked selector map used by `resolveTerritory` and `resolveTerritoryCapital`.
- New `src/core/territory/naming.ts` derives a repository's canonical and historical sources-store names; `src/core/storage/repository-stores.ts` takes store names instead of a root and inspects each scan candidate; `src/commands/repo/store.ts` wires both.
- New `src/tests/cli/territory/aliases.test.ts` and `src/tests/cli/repo/store-capital.test.ts`; `src/tests/cli/trade/trade.test.ts` updates the non-Capital key message.
- New TERRITORY-007; TERRITORY-001, REPO-OPS-020, REPO-OPS-025, REPO-AUDIT-009 and REGISTRY-004 revised. README, the territory-selection and repository-operations guides and `man/ki.1` describe aliases and Capital store names; `man/ki.commands.json` regenerated.

### Verification

- `bun run test:coverage`: 69 files, 1,139 tests passed, 100% statements, branches, functions and lines.
- TypeScript clean; Biome at the existing baseline (26 warnings, 13 infos); `mandoc -T lint`, the command inventory check and `rumdl` passed.
- `ki repo audit --repo .`: roadmap and documentation criteria pass. Remaining findings are pre-existing on `main`: KNIP-2 (unused `src/core/estate/index.ts` exports), CI-1 and HOOK-1 warnings.
- All store tests use fixture Capitals and a sandbox OneDrive root; no live store was touched.

### Outstanding concerns

- Remaining external work: the Harness-owned `ki-repo` TERR-2/TERR-3 contract does not yet know `territory_aliases`, and the Arcadia territory-selection decision predates aliases. Both owners must agree before any real Capital declares the key; until the Harness audit accepts it, a declared alias would fail Harness governance even though `ki` accepts it.
- The approved `territory_aliases = ["ki"]` for the knowledge-islands Capital is not applied; that is the Capital owner's change after the Harness accepts the key.
- Existing Capital stores bound under their basename stay bound; `store create` refuses to replace a different binding and no store is renamed or migrated.
- Alias selection through trade commands and qualified Project Capital lookup uses the same resolver but has no dedicated alias test.

### Post-change review

The change stays inside existing command/core boundaries: storage takes names and never imports territory, and the command composes them. Selection, filtering, scope conflicts and ranking are unchanged when no Capital declares aliases, and non-Capital store names are byte-identical.

### Mini recap

Record 118 delivered under Decision 114 rather than deferred: aliases and Capital store naming land in tools-ki; Harness and Arcadia agreement remain. Not accepted or pruned; no release.

## Done

Accepted 2026-10-12 by Kris on the review packet above.

## Discussion

### Acceptance authority

Kris explicitly approved acceptance and eligible pruning on 12 October 2026: "can you approve/accept anything awaiting review and prune all done including those too please" (tools-burndown Decision 12). The independent review checked the unchanged producer packet at `85a5c766554641c037b01935eff174a47b73aa29`; immutable baselines, completed Steps and producer evidence remain intact. No release or remote operation is authorised.

Acceptance includes the delivered canonical registered-key fallback and read-only canonical-plus-historical scan. Remaining Harness/Principal governance and real Capital alias-declaration choices are carried by the live ALIAS-OWNERS question in the [estate-factorisation checkpoint](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_CHECKPOINTS/platform-foundations.estate-factorisation.md), routed to Master CLI118-OWNERS. Those owner actions remain outside the tools-ki delivery boundary.

### Approval

Master state-of-play Decision 114 (12 October 2026, 06:45 BST) directs delivery of this record rather than deferral, and the run brief confirms "Kris does not want it deferred": take it to Ready, deliver and submit for review, delivering the rest and naming what remains if part genuinely depends on something not yet built. Under that grant the plan's recommendations are adopted as written: prefixless registered Capitals name stores by their registry-key handle, prefixless unregistered Capitals fail managed creation, scan reports canonical and historical Capital names read-only, and `territory_aliases` is an optional array with global fail-closed collisions. The grant covers adoption, planning, delivery to `main` and push after full gates, not acceptance, release or edits outside tools-ki.

Owner agreement on the Harness-owned TERR-2/TERR-3 metadata contract and the Arcadia territory decision is outside tools-ki. It does not block the tools-ki behaviour, but no real Capital should declare `territory_aliases` until the Harness `ki-repo` audit accepts the key, so delivery reports it as remaining work rather than claiming validation parity.

### Why one record fits

Both changes use the same Capital identity and canonical handle, share sandbox territory fixtures, and have one approval gate. Aliases affect selection only, so they cannot create alternate store names. Implementation can remain within the existing command/core boundaries without a new architecture, Project or Initiative.

### Owner choices and readiness

Recommend the registered-key fallback for prefixless Capitals and read-only historical-basename discovery alongside canonical names. Kris may instead retain prefixless basename creation or drop historical scan candidates, but either changes the exact test matrix and must be recorded before Ready. The proposed metadata name, empty-array semantics and global fail-closed collision policy also require his approval. Master Decision 51 is capture/planning authority only; completed Steps, approved delivery or Ready must not be inferred from it.

### Smallest compatible store change

Retain explicit bound-directory lookup and all role/authority gates. Extend only convention generation and scan candidates; do not invent inherited source access, traverse custom bindings, rewrite provenance, chase retired territory names or add legacy create fallback. Scanner order changes require retaining the existing post-inspection safety rechecks. This prevents silent loss of historical orphan discovery without performing a migration.
