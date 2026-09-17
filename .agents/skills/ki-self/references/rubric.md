<!-- GENERATED FILE: produced by `ki dev skill rubric`. Do not hand-edit; edit scripts/rubric/items/, then rerun `ki dev skill rubric <skill> --write`. -->

# Generated rubric — tools-ki repository-local governance

> **Generated publication.** The TypeScript rubric items under `scripts/rubric/items/` are canonical. Edit those definitions, then rerun `ki dev skill rubric ki-self --write`.

Line-by-line criteria for auditing ki-self. Classifications are derived from item aspects: **[M]** mechanical, **[J]** judgment, **[M + J]** hybrid, and **[M-heuristic + J]** hybrid with heuristic mechanical evidence. Sources are cited as declared by each canonical item.

## Contents

- [RUBRIC — Rubric publication](#rubric--rubric-publication)
- [PRODUCT — Product engineering](#product--product-engineering)
- [CLASSIFICATION — Skill classification](#classification--skill-classification)
- [REPAIR — Bootstrap and repair](#repair--bootstrap-and-repair)
- [PRESENTATION — Human-facing presentation](#presentation--human-facing-presentation)

## RUBRIC — Rubric publication

→ [standard](references/rubric.md)

Keeps the human-readable local rubric derived from this executable catalogue.

- **SELF-RUBRIC-001 [M] — Generated publication** — The committed rubric publication matches the native catalogue. (scripts/rubric/items/index.ts, references/rubric.md)
  - _Remediation:_ automatic

## PRODUCT — Product engineering

→ [standard](references/standards-product-engineering.md)

Keeps tools-ki architecture, executable-contract tests, and portable boundaries explicit.

- **SELF-ARCH-001 [J] — Command and domain ownership** — Command modules own grammar, selection, and rendering while core modules own typed domain behaviour and repository effects. (references/standards-product-engineering.md, src/commands, src/core)
  - _Evidence scope:_ Changed command and core modules, their imports, and public behaviour.
  - _Review prompt:_ Do command, core, presentation, and provider boundaries retain one clear owner without hidden reverse dependencies?
  - _Outcomes:_ conforming; gap identified
  - _Conforming guidance:_ Move behaviour to its owning domain and expose one typed seam; do not add a compatibility coordinator.
- **SELF-ARCH-002 [J] — Cohesive domain modules** — Modules group one domain concern and split only when responsibilities have independent reasons to change. (references/standards-product-engineering.md, src/core, src/commands)
  - _Evidence scope:_ Large or cross-cutting changed modules and their callers.
  - _Review prompt:_ Can a maintainer locate each policy and follow the ordinary flow without reconstructing unrelated lifecycle stages or abstractions?
  - _Outcomes:_ conforming; gap identified
  - _Conforming guidance:_ Extract a named domain seam when responsibilities evolve independently; never split solely by line count.
- **SELF-TEST-001 [J] — Executable contract evidence** — Tests drive the in-process CLI seam with injected capabilities and no live network. (references/standards-product-engineering.md, src/tests/cli/_cli_helper.ts, src/context.ts)
  - _Evidence scope:_ Changed product behaviour, failure paths, and provider interactions.
  - _Review prompt:_ Does each supported behaviour remain observable through run(args, context), with provider and filesystem effects controlled at the same boundary?
  - _Outcomes:_ conforming; gap identified
  - _Conforming guidance:_ Add CLI contract evidence or expose a supported port; do not freeze an internal helper with a substitute unit test.
- **SELF-TEST-002 [J] — Coverage exclusion proof** — Coverage exclusions document a whole-call-graph reason that no supported CLI input can reach the guarded branch. (references/standards-product-engineering.md, src)
  - _Evidence scope:_ Every added or changed v8 ignore and every new caller of an excluded function.
  - _Review prompt:_ Does each exclusion remain unreachable for every caller, with interface-level fault injection used only where one CLI invocation cannot produce the documented failure?
  - _Outcomes:_ conforming; gap identified
  - _Conforming guidance:_ Test reachable behaviour through the CLI, remove unsupported dead code, or document the complete boundary proof beside the narrow exclusion.
- **SELF-PORT-001 [J] — Portable meaning and authority** — Portable claims use their normative owner and cross-boundary records compare semantic projections without expanding authority. (references/standards-product-engineering.md)
  - _Evidence scope:_ Changed parsers, validators, cross-repository records, provider adapters, and normative documentation.
  - _Review prompt:_ Are external claims grounded in the owning standard, semantic equality used where formatting is non-authoritative, and mutation authority kept explicit?
  - _Outcomes:_ conforming; gap identified
  - _Conforming guidance:_ Verify the normative source, compare the owned semantic projection, and fail closed at repository or provider boundaries.

## CLASSIFICATION — Skill classification

→ [standard](references/rubric.md#classification)

Preserves the host distinctions between bootstrap inventory, managed projections, and capability sources.

- **SELF-CLASS-001 [M] — Bootstrap inventory authority** — The minimum bootstrap user-skill inventory has one named typed authority. (src/core/harness/bootstrap-capabilities.ts)
  - _Remediation:_ diagnostic — Restore minimumBootstrapUserSkills as the single typed inventory.
- **SELF-CLASS-002 [M] — Managed user scope** — Bootstrap and repair retain explicit user-scoped managed-skill projection. (src/agents/bootstrap.ts, src/commands/manage/repair.ts)
  - _Remediation:_ diagnostic — Restore explicit user scope at the managed-skill activation boundary.
- **SELF-CLASS-003 [M] — Capability source discovery** — Bootstrap resolves classified capability sources rather than reconstructing category paths. (src/agents/bootstrap.ts)
  - _Remediation:_ diagnostic — Resolve managed skills through inspected capability.source metadata.

## REPAIR — Bootstrap and repair

→ [standard](references/rubric.md#bootstrap-and-repair)

Keeps bootstrap validation and repair coverage complete and automation-visible.

- **SELF-BOOTSTRAP-001 [M] — Shared bootstrap inventory** — Bootstrap and canonical Harness restoration consume the authoritative minimum inventory. (src/agents/bootstrap.ts, src/core/storage/harness-installation.ts)
  - _Remediation:_ diagnostic — Route every bootstrap and restoration consumer through minimumBootstrapUserSkills.
- **SELF-REPAIR-001 [M] — Configured skill coverage** — Repair and diagnostics inspect every configured managed identity. (src/core/manage/repair.ts, src/core/manage/doctor.ts)
  - _Remediation:_ diagnostic — Iterate the complete configured skill inventory in repair and doctor.
- **SELF-REPAIR-002 [M] — Local capability resolution** — Local Harness development resolves sources through inspected capability metadata. (src/agents/bootstrap.ts)
  - _Remediation:_ diagnostic — Keep localBootstrapHarness on inspectHarnessSourceRoot and capability.source.
- **SELF-REPAIR-003 [M] — Automation failure signal** — A failed manage repair result exits non-zero after rendering its summary. (src/commands/manage/repair.ts)
  - _Remediation:_ diagnostic — Preserve FAIL summary rendering and KiExit(1) for repair failure.

## PRESENTATION — Human-facing presentation

→ [standard](references/rubric.md#presentation)

Keeps inventories and diagnostics framed while preserving direct contract-oriented streams.

- **SELF-OUTPUT-001 [M] — Human-facing report frame** — Representative human-facing inventory and diagnostic commands retain titled tree summaries. (src/commands/agora/list.ts, src/commands/manage/diag.ts, src/commands/manage/list.ts, src/commands/manage/repair.ts, src/commands/manage/update.ts, src/commands/repo/diag.ts, src/commands/repo/repair.ts, src/commands/repo/upgrade.ts, src/commands/trade/records.ts)
  - _Remediation:_ diagnostic — Restore renderTree with a title and compact summary on human-facing reports.
- **SELF-OUTPUT-002 [J] — Contract output boundary** — Plain streams, canonical records, generated assets, and action receipts remain direct interfaces. (references/rubric.md)
  - _Evidence scope:_ Changed CLI presentation and its consumer-facing contract tests.
  - _Review prompt:_ Do contract-oriented outputs remain concise, stable, and unframed where framing would alter their interface?
  - _Outcomes:_ conforming; gap identified
  - _Conforming guidance:_ Keep tree framing for human reports; preserve direct output for machine or action contracts.
