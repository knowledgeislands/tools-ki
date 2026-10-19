---
id: KI-TOOL-KI-CLI-164
area: CLI
title: Estate hook binding sweep
purpose: capability
project: tools-burndown
component: repo
priority: high
size: m
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T22:46:17Z
updated_at: 2026-10-19T22:46:17Z
transferred_from: ki-principal ki.tools-burndown hooks-standard design section 4.2, HOOK-CAPTURE a), 2026-10-19
---

# KI-TOOL-KI-CLI-164: Estate Hook Binding Sweep

## Goal

Every registered clone on a machine runs its committed `.githooks/` gate, because one estate-wide step binds each clone whose tracked hook is unbound, with a preview first and a way back, rather than relying on each clone being conformed or installed by hand.

## Context

Kris decided on 19 October, under GIT-HOOKS a) in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md), that every KI repository keeps its hooks in a committed `.githooks/` bound by a relative `core.hooksPath`. The binding is clone-local Git configuration, so `git clone` never copies it, and a clone nobody conforms or installs commits unchecked. The [hooks-standard design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/design/hooks-standard.md), section 4.2, names an estate sweep in `ki estate converge` for this, and section 5 runs it on Terra and Sol after the last wave, before the hook checks move to FAIL.

Kris took HOOK-CAPTURE a) at 23:21 BST the same evening: capture the scope now and leave the plan to pilot evidence. That evidence exists: the wave 1 pilot converted tools-ki, ki-principal and va-principal, and in each `ki repo conform` bound the clone it ran in. [KI-TOOL-KI-CLI-163](KI-TOOL-KI-CLI-163-githooks-conversion.md) delivered the per-clone binding in `ki repo conform`: unset or `.husky/_` becomes `.githooks`, any other value is reported and left, and a leftover untracked `.husky/_` is removed. This record carries that rule across every registered clone on a machine. At 23:24 BST Kris collapsed waves 2 to 5 into one estate-wide migration, so the sweep is what closes the gap on the second machine and in clones the migration does not visit.

`ki estate converge` today previews, applies and rolls back moves of local checkouts to an estate targets manifest, with action kinds in `src/core/estate/model.ts` and a converge log that `--rollback` reverses.

## Boundary

- In: a `hooks-path` action, planned for each registered clone with a tracked `.githooks/pre-commit` whose effective `core.hooksPath` is unset or `.husky/_`; the leftover untracked `.husky/_` removal; one action per clone covering its linked worktrees; preview, apply and roll-back through the converge log, rolling back by restoring the previous value or unsetting it; reporting, without changing, any other value; tests through `run(args, context)`; help, manual and guide lines.
- Out: writing or composing hook content, which [KI-TOOL-KI-CLI-163](KI-TOOL-KI-CLI-163-githooks-conversion.md) and [KI-TOOL-KI-CLI-165](KI-TOOL-KI-CLI-165-hook-composition-claims-host.md) own; `ki git check-message` ([KI-TOOL-KI-CLI-161](KI-TOOL-KI-CLI-161-git-check-message.md)); a clone without `.ki.toml`, which NON-KI a) leaves out; running the sweep on either machine, which the migration run owns; raising the hook checks to FAIL, which the harness owns.

## Discussion

### Where the action belongs

`ki estate converge` is built around a targets manifest of moves. A binding needs no manifest entry, so planning should decide whether the sweep is a mode of `converge` that plans from the registry alone, an action every converge run adds, or a separate `ki estate` subcommand sharing the converge log and roll-back. The design note names `converge`; the manifest requirement may argue otherwise.

### Worktree overrides

`extensions.worktreeConfig` lets a linked worktree override `core.hooksPath`. Planning should decide whether the sweep reports such an override, as `HOOK-2` does, or leaves it to the audit.

### Reuse

The binding rule already lives in `src/core/repository/hooks.ts`; the sweep should call it rather than restate it, so `conform` and the sweep cannot disagree.
