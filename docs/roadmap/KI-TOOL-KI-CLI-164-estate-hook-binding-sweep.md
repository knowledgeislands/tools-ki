---
id: KI-TOOL-KI-CLI-164
area: CLI
title: Estate hook binding sweep
kind: deliver
purpose: capability
project: tools-burndown
component: repo
priority: high
size: m
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: f0cc4012a8932538cc29bae4824c00ce20b48672
created_at: 2026-10-19T22:46:17Z
updated_at: 2026-10-20T00:16:07Z
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

## Current state

`ki estate converge` takes exactly one manifest or `--rollback <log>`; it plans `ConvergeAction`s, writes a `ki/estate-converge/v1` log after every step and reverses it on `--rollback`. `src/core/repository/hooks.ts` decides one clone's binding in a private `currentBinding`: `.githooks` already bound is nothing, unset or `.husky/_` binds, anything else is kept and reported. `ki repo conform` removes `.husky/` during the conversion.

## Design

Decided under HIGH-APPLY, 20 October, with the coordinator's HOOK-ADOPT a) adopting the record:

- **Where:** `ki estate converge --hooks`, exclusive with a manifest and with `--rollback`, plans from the local registry alone and shares the converge preview, `--apply`, log and `--rollback`. It stays in `converge`, as the design note names, without inventing a manifest entry or mixing binding into a move run whose paths change underneath it.
- **Which clones:** each registered checkout with `.ki.toml` and a tracked `.githooks/pre-commit`. A path that is missing or not a primary checkout is reported as skipped.
- **Actions:** `hooks-path` with the previous value, planned by the same rule `ki repo conform` uses, exported from `hooks.ts` rather than restated; rollback restores the previous value or unsets it. Any other value is a note, left alone. A `.husky/` with nothing tracked in it is set aside under the converge state folder by a `set-aside` action, which rollback moves back; it is never deleted.
- **Worktrees:** the binding lives in the shared repository configuration, so one action covers every linked worktree. With `extensions.worktreeConfig` on, a linked worktree whose own configuration sets `core.hooksPath` is reported as a note and left, as `HOOK-2` reports it.
- **Output:** one line per clone, `bind`, `bound`, `skip` or `keep`, its actions and notes, and a summary count line.

## Requirements

1. The preview lists every registered KI clone with a tracked `.githooks/pre-commit` and an unbound or Husky binding, and changes nothing.
2. `--apply` binds them, sets aside an untracked `.husky/`, and writes a converge log.
3. `--rollback <log> --apply` restores each previous value or unsets it, and moves `.husky/` back.
4. A clone already bound, without committed hooks, or without `.ki.toml` gets no action; another value and a worktree override are reported and left.
5. `--hooks` with a manifest, `--rollback`, `--clone` or `--allow-busy` is a usage error.

## Steps

- [x] Export the binding rule from `src/core/repository/hooks.ts`.
- [x] Add `hooks-path` and `set-aside` actions to `src/core/estate/model.ts` and `apply.ts`, with their inverses.
- [x] Add `src/core/estate/hooks.ts` planning the sweep from the registry.
- [x] Add `--hooks` to `src/commands/estate/converge.ts` with its rendering.
- [x] Add tests through `run(args, context)` in `src/tests/cli/estate/`.
- [x] Update the manual, regenerated command inventory and changelog.
- [x] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/repository/hooks.ts`, `src/core/estate/{model,apply,hooks,index}.ts`, `src/commands/estate/converge.ts`
- `src/tests/cli/estate/hooks.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and `ki repo audit` pass.
- The source-built `ki estate converge --hooks` previews this machine's registry without changing it.

## Dependencies / blocks

Builds on [KI-TOOL-KI-CLI-163](KI-TOOL-KI-CLI-163-githooks-conversion.md), done. Running the sweep on Terra and Sol belongs to the migration run.

## Documentation impact

### Decision Records

None.

### Specifications

None: no specification covers `ki estate converge` yet.

### Guides

None beyond the manual.

### Roadmap

None.

## Review

### Delivered

The whole record, from baseline `f0cc4012` on 20 October 2026, by the `burnki` run in the tools-burndown Project.

### Change Summary

- `src/core/repository/hooks.ts`: `currentBinding` and `HOOK_DIRECTORY` are exported, so `conform` and the sweep share one binding rule.
- `src/core/estate/model.ts`, `apply.ts`: new `hooks-path` and `set-aside` actions. `hooks-path` sets `core.hooksPath` or unsets it, and its inverse swaps the two values. `set-aside` moves a folder and is reversed by moving it back.
- `src/core/estate/hooks.ts`: `planHookSweep` plans from the local registry. It skips registered linked worktrees, passes over clones without `.ki.toml` or a tracked `.githooks/pre-commit`, binds unset or Husky bindings, keeps and reports any other value, sets an untracked `.husky/` aside under `converge/set-aside/<stamp>/`, and notes linked-worktree overrides when `extensions.worktreeConfig` is on.
- `src/commands/estate/converge.ts`: `--hooks [--apply]` prints one `bind`, `bound`, `keep` or `skip` line for each clone, then a summary. It is exclusive with a manifest, `--rollback`, `--clone` and `--allow-busy`.
- `src/tests/cli/estate/hooks.test.ts`: covers preview, apply, idempotent rerun, rollback, rollback of the rollback, and grammar, all against real Git.
- `man/ki.1`, the regenerated command inventory and the changelog.

### Verification

| Requirement | Evidence |
| --- | --- |
| 1 preview lists and changes nothing | `previews, applies and rolls back the hook binding sweep` asserts the exact preview and an unchanged `core.hooksPath` |
| 2 apply binds, sets aside, logs | the same case asserts both bindings, the moved `.husky/` contents and the log's registry manifest |
| 3 rollback restores | the same case asserts the unset and `.husky/_` values and `.husky/` moved back; reversing the rollback log plans the bind again |
| 4 no action or report-only cases | bound, no `.ki.toml`, no tracked hook, another value and a worktree override in the same fixture; the rerun applies nothing |
| 5 usage errors | `rejects a manifest, --rollback, --clone and --allow-busy alongside --hooks` |

- Gate: `bun run test:coverage` passed with 1,454 tests at 100%. `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and the command-inventory check passed. `ki repo audit --repo .` reported FAIL=0.
- The source-built `ki estate converge --hooks` previewed this machine's registry without changing it: 47 clones are bound, and `ki-design` would be rebound from `.husky/_`.

### Outstanding concerns

- The sweep has not been applied on any machine. Running it on Terra and Sol belongs to the migration run, and `ki-design` is this machine's only candidate.

### Post-change review

A single estate-wide command now brings every registered KI clone to its committed hooks, using the same rule as `ki repo conform`, and the existing converge log reverses it.

### Mini recap

`ki estate converge --hooks` previews, applies and rolls back hook binding across the registry.

## Discussion

### Where the action belongs

`ki estate converge` is built around a targets manifest of moves. A binding needs no manifest entry, so planning should decide whether the sweep is a mode of `converge` that plans from the registry alone, an action every converge run adds, or a separate `ki estate` subcommand sharing the converge log and roll-back. The design note names `converge`; the manifest requirement may argue otherwise.

### Worktree overrides

`extensions.worktreeConfig` lets a linked worktree override `core.hooksPath`. Planning should decide whether the sweep reports such an override, as `HOOK-2` does, or leaves it to the audit.

### Reuse

The binding rule already lives in `src/core/repository/hooks.ts`; the sweep should call it rather than restate it, so `conform` and the sweep cannot disagree.

All three questions are settled in Design.
