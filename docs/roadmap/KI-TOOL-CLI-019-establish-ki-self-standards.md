---
id: KI-TOOL-CLI-019
title: Establish KI self
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: 0939ffe4acef8144bbb041b10373c35cf1ed390a
---

## Goal

Give this repository a `ki-self` governance skill with its own rubric, so the `ki` host's repository-specific operating standards are auditable rather than being an informal alternative to `AGENTS.md` or `CLAUDE.md`.

## Context

`tools-ki` has accumulated local expectations through its CLI contract, output conventions, release surfaces, and runtime-host responsibilities. Some may generalise to every Knowledge Islands tools repository and belong in `ki-tools`; others apply only to this CLI and need a clear local home. Without that boundary, repository-specific standards are either absent from durable guidance or risk being promoted into a general skill prematurely.

## Boundary

This item does not replace always-loaded contribution instructions, promote local rules into `ki-tools`, make `ki-self` a bootstrap user skill, or independently define the portable lifecycle of a repository-local skill. It specifies the local capability and asks the harness to formalise the reusable contract deliberately.

## Required shape

`ki-self` is repository-local governance, not a process skill and not a second instruction file. `AGENTS.md` and runtime instruction files remain the operational contract that applies to every contribution. `ki-self` owns the narrower set of durable, inspectable requirements that are specific to this CLI host, including a rubric with named criteria, evidence surfaces, and judgment boundaries.

The source must remain committed in this repository. A runtime projection is derived state, not a copied or independently authored skill. The portable discovery, projection, native audit/conform execution, and rubric-publication lifecycle remain for the harness to formalise.

## Current state

The first committed local source and rubric were removed immediately after their initial creation, while this item retained its required shape. The repository therefore has an explicit design but no local source that can carry its reviewed governance.

## Steps

- [x] Restore the committed `ki-self` source and its initial bootstrap and repair rubric.
- [x] Add the stable local boundary for framed human-facing CLI reports, including the deliberately plain interfaces it excludes.
- [x] Reconcile this item's claims with the harness handoff and record delivery evidence for review.

## Files touched

- `.agents/skills/ki-self/SKILL.md`
- `.agents/skills/ki-self/references/rubric.md`
- `docs/roadmap/KI-TOOL-CLI-019-establish-ki-self-standards.md`

## Verify

- `ki repo audit --skill ki-roadmap --repo .`
- `bunx prettier --check .agents/skills/ki-self/SKILL.md .agents/skills/ki-self/references/rubric.md docs/roadmap/KI-TOOL-CLI-019-establish-ki-self-standards.md`
- `git diff --check`

## Dependencies / blocks

The local source and its readable rubric do not depend on native host execution. [TRD-af376594](../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md) remains the separate harness-owned request for portable discovery, projection, native audit/conform execution, and rubric publication.

## Initial rubric coverage

The first `ki-self` rubric defines and checks the following concerns.

### Bootstrap classifications

- Identify the canonical bootstrap user-skill inventory from one named, typed authority; do not duplicate the list in bootstrap, refresh, local-development, or repair logic.
- Distinguish a bootstrap skill, configured managed identity, resolved source, and agent-runtime projection. Require each path of the host to preserve those distinctions rather than treating a configured identity or projection as the inventory itself.
- Resolve sources from inspected harness capabilities, never from an assumed `skills/<kind>/<name>` directory layout.

### Bootstrap and repair coverage

- Verify that bootstrap, refresh, and local-development activation use the canonical bootstrap inventory and fail before projection when a required member is unavailable.
- Verify that `ki manage repair` covers every canonical bootstrap skill and any additional configured managed skill. It must report unavailable sources and incompatible agents, and must exit non-zero when it cannot restore the required managed state.
- Verify that active canonical local-harness development supplies repair sources through capability discovery, rather than a reconstructed skill path.

### Scope classification

- Use the rubric to classify local host concerns: bootstrap and projection management, native operation boundaries, output and release conventions, and other stable product rules.
- Promote a requirement that applies across compatible repositories to its portable harness owner instead of growing `ki-self` into a catch-all instruction surface.

## Review

### Delivered

Restored the committed [local `ki-self` source](../../.agents/skills/ki-self/SKILL.md) and [its rubric](../../.agents/skills/ki-self/references/rubric.md). The rubric now covers the bootstrap, repair, capability-discovery, and human-facing presentation boundaries that are specific to this CLI host.

### Summary of changes

- Re-established `ki-self` as committed repository-local governance rather than a replacement for `AGENTS.md`.
- Defined a framed-tree contract for human-facing reports, with counts, state glyphs, and compact summaries.
- Preserved deliberately plain output where a stream, canonical record, generated asset, or immediate receipt is the direct contract.
- Retained the separate harness trade for portable lifecycle and native-operation support.

### Verification

- `ki repo audit --skill ki-roadmap --repo .` — pass.
- `bunx prettier --check .agents/skills/ki-self/SKILL.md .agents/skills/ki-self/references/rubric.md docs/roadmap/KI-TOOL-CLI-019-establish-ki-self-standards.md` — pass.
- `bunx vitest run src/tests/cli/manage/list.test.ts src/tests/cli/manage/diag.test.ts src/tests/cli/manage/repair.test.ts src/tests/cli/manage/update.test.ts src/tests/cli/agora/agora.test.ts src/tests/cli/repo/repo.test.ts src/tests/cli/repo/roadmap.test.ts src/tests/cli/trade/trade.test.ts` — 98 passed.
- `git diff --check` — pass.

### Outstanding concerns

The repository-wide `ki-authoring` audit still finds pre-existing formatting drift in four unrelated trade records. This delivery leaves those records unchanged. The source is not yet a declared, installed harness capability; that remains owned by [TRD-af376594](../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md).

### Post-change review

The restored source is intentionally a readable local contract, not a claim that native `ki repo audit --skill ki-self` works today. The presentation rule is limited to established `tools-ki` interfaces and provides an explicit promotion boundary if another compatible CLI needs the same standard.

### Mini recap

The initial source was restored, its output-boundary application was completed, and the roadmap now accurately separates local governance from the harness-owned portable lifecycle.

## Discussion

### Ownership boundary

Inventory the standards currently expected by this repository, classify each as portable or repository-specific, and record the latter in `ki-self`. Keep `ki-tools` focused on standards that are demonstrably useful across compatible CLI repositories. Treat an existing local convention as evidence to evaluate, not automatic justification for a new general rule.

### Delivery approval

The user selected this item for immediate delivery on 2026-08-06, after reviewing the removal of the initial local source. The delivery is deliberately documentation-governance only: it restores the committed source and makes its evidence boundary explicit; it does not claim native `ki repo audit --skill ki-self` support before the harness accepts the separate trade.

### First application

The output conventions introduced for framed list and inspection commands are now recorded as local `ki-self` rules. The rubric distinguishes human-facing reports from stream, canonical-record, generated-asset, and action-receipt interfaces. A future cross-repository pattern belongs in `ki-tools`, not a larger local rubric.

### Portable lifecycle

The harness already recognises a committed `.agents/skills/ki-self/` source as repository-authored governance and runtime projections as derived links. [TRD-af376594](../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md) asks it to formalise the remaining portable shape: discovery, activation, native audit/conform execution, and generated rubric publication. Until that work is accepted, this item must not claim that `ki-self` is an installed harness capability.
