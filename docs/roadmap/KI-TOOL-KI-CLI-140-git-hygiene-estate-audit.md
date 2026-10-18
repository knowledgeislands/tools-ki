---
id: KI-TOOL-KI-CLI-140
area: CLI
title: Git hygiene estate audit
project: tools-burndown
purpose: capability
kind: deliver
component: repo
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T00:29:07Z
updated_at: 2026-10-18T04:15:00Z
---

# Git Hygiene Estate Audit

## Goal

`ki repo audit --skill ki-git` reports, and `ki repo conform --skill ki-git` proposes clean-down for, each repository's open pull requests, merged and stale branches (automation branches included), commits ahead of or behind upstream, stashes, linked worktrees and untracked or staging-area leftovers, so that the PR and branch clean-down rubric checks run fleet-wide over the same estate `mgit` selects.

## Context

Kris Brown, in the tools-burndown thread on 16 October 2026 (REPO-GIT-HYGIENE): "Make the PR and branch clean-down ki-git rubric checks run through ki repo audit and conform, fleet-wide through mgit." STALE-BRANCHES, AUTOMATION-BRANCHES, UNPUSHED-COMMITS and STAGING-LEFTOVERS are folded into it.

What `mgit` 0.17.0 reports today ([bin/mgit](../../../tools-mgit/bin/mgit)):

| Fact | `mgit` today |
| --- | --- |
| Open pull requests | Not reported. |
| Merged or stale branches, local or remote | Not reported. |
| Ahead and behind | Only as a side effect of `mgit sync`, which pulls fast-forward and then pushes local commits ahead of upstream; there is no read-only report. |
| Stashes | Not reported. |
| Worktrees | `mgit worktree list` and `mgit worktree status` list each worktree with branch, prunable or locked state and clean or dirty. |
| Untracked files | Only folded into "dirty"; `sync` prints short status for a dirty checkout and skips it. |

`doctor`, `diag` and `repair` cover configuration only. `mgit --estate`, `--territory` and `--principals` resolve their roots through `ki`, and `ki repo` already accepts the same selectors (`--estate`, `--territory`, `--principals`, `--filter`; [repo/index.ts](../../src/commands/repo/index.ts)), so the fleet-wide selection exists on both sides.

On the rubric side, the `ki-git` rubric in ki-agentic-harness has one mechanical criterion (RUBRIC-1, the catalogue check). BRANCH-2 covers finished linked worktrees only; nothing checks remote branches, open PRs, stashes or ahead/behind.

A read-only `mgit --estate` survey on 16 October 2026 across 50 repositories, from local refs, found no stashes and no linked worktrees; 25 unmerged remote branches in 11 repositories, 6 of them `automation/*` release branches; 1 merged local branch with a gone upstream; 3 `main` branches ahead of `origin` and 11 behind; and the staging-area leftovers already named in the state-of-play query review. The full facts are in the git-hygiene run report in the ki-principal tools-burndown thread folder.

## Boundary

- In: reading `mgit overview --json` ([KI-TOOL-MGIT-CLI-021](/Users/krisbrown/workspaces/knowledge-islands/tools-mgit/docs/roadmap/KI-TOOL-MGIT-CLI-021-estate-overview.md)) for the read-only Git facts per selected repository (branches with upstream track, merged-into-default and patch-equivalence, age, remote branches including `automation/*`, `dependabot/*` and `renovate/*`, stashes, linked worktrees, untracked and staged paths, open PR count when a provider is available); mechanical audit findings for them under the ki-git rubric's criteria; `conform` proposals that never delete a remote branch or close a PR without explicit approval; fleet runs through the existing `ki repo` selectors; contract tests through `run(args, context)` with injected Git and no network.
- Out: the ki-git rubric and standard wording, which KI Model: ways-of-working owns in ki-agentic-harness; collecting those Git facts a second time in `ki`, and any change to `mgit`, which KI-TOOL-MGIT-CLI-021 owns; deleting or pushing anything during audit; clean-down of today's branches, which runs as the tools-burndown queries.

## Current state

Adopted to `next` as a draft on 16 October 2026 and not yet planned; `ki-plan` records the current state before this record becomes Ready.

## Steps

- [ ] Shape this record through `ki-plan`; no delivery step is planned yet.

## Files touched

Not yet determined.

## Verify

Not yet set. The plan names the exact gates; at minimum the repository test suite through `run(args, context)` and the `ki-engineering` audit.

## Dependencies / blocks

Planning depends on the ki-git rubric gaining the clean-down criteria the audit evaluates ([KI-HARNESS-GOV-203](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-203-git-clean-down-criteria.md)), and on `mgit overview --json` from [KI-TOOL-MGIT-CLI-021](/Users/krisbrown/workspaces/knowledge-islands/tools-mgit/docs/roadmap/KI-TOOL-MGIT-CLI-021-estate-overview.md).

## Documentation impact

### Decision Records

Not yet assessed.

### Specifications

Not yet assessed.

### Guides

Not yet assessed.

### Roadmap

None.

## Discussion

Capture only; adoption, priority and plan belong to this repository. Questions for planning: whether open-PR facts come from `gh` behind an injected provider or stay out of scope offline; whether the Git fact collection belongs in `ki` or as a read-only `mgit` report that `ki` consumes; and the stale-age threshold.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, whose Scope lists this record as the one REPO-GIT-HYGIENE capture inside its burn-to-zero, under the tools-burndown thread's BURN-OVERNIGHT decision. Planning waits on the ki-git rubric dependency above.

Reworded on 18 October 2026 by the tools-burndown run: the roadmap overview's ESTATE-HOME query recommended a), "mgit owns `mgit overview`, terminal table and `--json`, copying git-almanac's output conventions. KI-TOOL-KI-CLI-140 reworded to read mgit's JSON, and git-almanac stays single-repository". The run took a) under Kris's overnight instruction to take the recommended course on a judgement call; provisional, for Kris to confirm. That answers the planning question of where Git fact collection belongs.
