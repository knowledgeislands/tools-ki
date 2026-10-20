---
id: KI-TOOL-KI-CLI-165
area: CLI
title: Hook composition claims host
kind: deliver
purpose: capability
project: tools-burndown
component: repo
priority: medium
size: m
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T22:46:17Z
updated_at: 2026-10-20T00:34:00Z
transferred_from: ki-principal ki.tools-burndown hooks-standard design section 4.2, HOOK-CAPTURE a), 2026-10-19
---

# KI-TOOL-KI-CLI-165: Hook Composition Claims Host

## Goal

`ki repo conform` can write a repository's first committed `.githooks/pre-commit` and `.githooks/commit-msg`, and keep them current, by composing the `ki-repo` frame with the content lines each declared shape skill claims, so that a repository with no hook and no Husky gets the gate its shape requires without a hand-written file.

## Context

Kris decided on 19 October, under GIT-HOOKS a) in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md), that all hook content lives in a committed `.githooks/`. The [hooks-standard design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/design/hooks-standard.md), section 2.2, gives each shape's content and its owning criterion, and section 4.2 names a claims mechanism in `ki repo conform` on the model of the package-script claims: `ki-repo` supplies the frame, each shape skill claims its content lines, the file is written deterministically at mode `100755`, and a file with lines the host cannot attribute is refused rather than overwritten.

Kris took HOOK-CAPTURE a) at 23:21 BST: capture the scope now, plans refined by pilot evidence, with the claim declarations and standards in a linked ki-agentic-harness record, [KI-HARNESS-GOV-225](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-225-hook-content-claims.md). The hcreview blind review found the mechanism is mostly host code in tools-ki.

[KI-TOOL-KI-CLI-163](KI-TOOL-KI-CLI-163-githooks-conversion.md) converts a Husky repository by composing from what it already runs, so it needs no claim; its outstanding concerns note that a repository with neither hook nor Husky gets nothing. The wave 1 pilot met exactly that in va-principal, whose `.githooks/pre-commit` was hand-written under VA-HOOKS a). The package-script claims are the model: rubric catalogues declare `packageScripts`, `src/core/rubric/loader.ts` validates them, and `conformRepositories` passes the aggregated `packageScriptClaims` to each skill's rubric session.

## Boundary

- In: loading and validating hook-content claims from rubric catalogues beside `packageScripts`; aggregating them per repository in declared skill order; composing each hook as frame then claimed lines, at mode `0755`, idempotently; refusing, writing nothing, when an existing hook carries a line no claim or frame rule attributes; reusing the frame recogniser in `src/core/repository/hooks.ts`; dry-run reporting; tests through `run(args, context)` with ki-principal's and va-principal's converted hooks as fixtures; manual, guide and changelog lines.
- Out: the claim declarations, the `ki-repo` frame template text and the shape criteria, which [KI-HARNESS-GOV-225](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-225-hook-content-claims.md) owns; the Husky conversion, which KI-TOOL-KI-CLI-163 delivered; the estate binding sweep, [KI-TOOL-KI-CLI-164](KI-TOOL-KI-CLI-164-estate-hook-binding-sweep.md); `ki git check-message`, [KI-TOOL-KI-CLI-161](KI-TOOL-KI-CLI-161-git-check-message.md); running conform against any repository.

## Shaping

**Approach:** hook-content claims declared beside `packageScripts` in rubric catalogues, validated in `src/core/rubric/loader.ts` and aggregated per repository in declared skill order, then composed by `ki repo conform` as the `ki-repo` frame followed by the claimed lines, at mode `0755`, refusing any existing hook with an unattributed line.

**Dependencies:** [KI-HARNESS-GOV-225](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-225-hook-content-claims.md), which owns the claim declarations and frame text and leads the build.

**Decisions still needed:** how repository-specific lines are kept, and whether the KI-TOOL-KI-CLI-163 conversion merges with composition, as set out in Discussion.

**Promotion to Next:** when KI-HARNESS-GOV-225 settles the claim declaration shape and the repository-specific lines question is answered.

## Discussion

Adopted to Soon on 20 October 2026 under the coordinator's HOOK-ADOPT a). It stays a draft: nothing claims a hook line until KI-HARNESS-GOV-225 lands, and how repository-specific lines are kept is raised with the coordinator as HOOK-LOCAL rather than decided here.

### Repository-specific lines

ki-principal and ki-agentic-harness carry lines no shape skill would claim, such as staged-skill functions. Planning should decide how such lines are kept: a marked local block the host preserves verbatim, a repository-level claim in `.ki.toml`, or refusal until a skill claims them.

### Relationship to the conversion

Once claims exist, the KI-TOOL-KI-CLI-163 conversion could compose from claims as well as from Husky content. Planning should decide whether the two paths merge or stay separate, and the order in which conform runs them.

### Build order

The host can be written against fixture catalogues, but nothing in the estate claims a line until KI-HARNESS-GOV-225 lands, so the harness record leads.
