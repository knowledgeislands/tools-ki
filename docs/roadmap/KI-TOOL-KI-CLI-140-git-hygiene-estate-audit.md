---
id: KI-TOOL-KI-CLI-140
area: CLI
title: Git hygiene estate audit
project: tools-burndown
purpose: capability
kind: deliver
size: m
component: repo
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T00:29:07Z
updated_at: 2026-10-21T03:23:36Z
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

- In: reading `mgit overview --json` ([KI-TOOL-MGIT-CLI-021](https://github.com/knowledgeislands/tools-mgit/blob/2ca3a8e06b88deb72b48476420f0f2211e56f5b8/docs/roadmap/KI-TOOL-MGIT-CLI-021-estate-overview.md)) for the read-only Git facts per selected repository (branches with upstream track, merged-into-default and patch-equivalence, age, remote branches including `automation/*`, `dependabot/*` and `renovate/*`, stashes, linked worktrees, untracked and staged paths, open PR count when a provider is available); mechanical audit findings for them under the ki-git rubric's criteria; `conform` proposals that never delete a remote branch or close a PR without explicit approval; fleet runs through the existing `ki repo` selectors; contract tests through `run(args, context)` with injected Git and no network.
- Out: the ki-git rubric and standard wording, which KI Model: ways-of-working owns in ki-agentic-harness; collecting those Git facts a second time in `ki`, and any change to `mgit`, which KI-TOOL-MGIT-CLI-021 owns; deleting or pushing anything during audit; clean-down of today's branches, which runs as the tools-burndown queries.

## Current state

Selected Next work; no implementation has started and `baseline_ref` remains null. This offline plan is authorised by the 21 October 2026 `wow-night-cli-140-plan-f` dispatch under Kris's OVERNIGHT-BURNDOWN, 01:40 and 01:55 grants. The coordinator designated this run as the sole tools-ki roadmap writer in the [work state](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/state.md#writers). Planning approval permits Ready only after the required checks pass; it does not approve delivery, acceptance or cleanup.

The historical Context describes mgit 0.17.0. The supported local baseline is now mgit 0.18.0 at `78a1b376cab73614ca896602557c3f4b9d4ce6b3`, whose overview producer and fixtures are committed and available. The current CLEAN contract is byte-identical to Harness `b91fa71dba7ea902e7c1fa8eefa9d515e226a741`; CLEAN-2 to CLEAN-7 accept the optional `gitOverview` session property, while CLEAN-1 remains judgement-only. tools-ki at `d5eac480f6b44a7fe0bb1ca1d2b7340decbefcab` does not yet supply that property in `src/core/runtime/audit.ts`, so those mechanical checks remain unassessed. This plan uses only delivered facts; the historical Goal and Boundary's conditional PR ambition remains outside this implementation.

At tools-ki baseline `f95bc710d3b518c6b664a49e2bcd5d00cfe1eda5`, `src/core/runtime/audit.ts` creates rubric sessions without that property. CLEAN-2 to CLEAN-7 therefore remain unassessed until the host supplies evidence. CLEAN-1 is judgement-only. The implementation outcome is evidence composition and guarded findings for supported facts, not proof of an entirely clean estate.

### Evidence contract

Pass the parsed `mgit overview --json` object without reshaping it or deriving another Git fact model. The producer's executable schema is [overview_json_repository](https://github.com/knowledgeislands/tools-mgit/blob/78a1b376cab73614ca896602557c3f4b9d4ce6b3/bin/mgit#L3410); its [overview fixtures](https://github.com/knowledgeislands/tools-mgit/blob/78a1b376cab73614ca896602557c3f4b9d4ce6b3/tests/mgit.bats#L3040) exercise that schema. There is no separate JSON Schema file to import.

The envelope carries `tool: "mgit"`, `command: "overview"`, `version`, `stale_days`, `repositories` and `summary`. A successful repository record carries `label`, physical `path`, `state`, `bare`, nullable `branch`, `detached`, `upstream` (`state`, nullable `name`, `ahead`, `behind`), `changes` (`staged`, `modified`, `untracked`, `conflicted`), `stashes`, nullable `last_commit_age_days`, nullable `last_fetch_age_days`, `obsolete_branches` and `findings`. Repository-wide `worktrees` counts (`linked`, `prunable`, `detached`) and `default_branch` can be absent on secondary checkout records; a reported `default_branch` can be null. Secondary zero stash counts are placeholders, not evidence of no repository stashes. An obsolete-branch entry carries `name`, `scope`, `reasons`, nullable `age_days` and `automation`; a failed record instead carries `label`, `path`, `state: "failed"` and `error`.

The Harness [Git session](https://github.com/knowledgeislands/ki-agentic-harness/blob/b91fa71dba7ea902e7c1fa8eefa9d515e226a741/skills/governance/ki-git/scripts/rubric/contexts/git.ts) owns canonical-path matching and validation of consumed facts. The host parses JSON and forwards it; it does not interpret `summary.clean`, record `state`, producer `findings` or unknown extra fields as a CLEAN verdict. No PR field, worktree lock reason, worktree-branch merge state, non-checked-out branch divergence or upstream-free unpublished-commit fact is added or inferred.

### Document shape and scope

The unchanged top-level document contains `tool: "mgit"`, `command: "overview"`, `version`, `stale_days`, `repositories` and `summary`; there is no schema-version or collection-timestamp field to invent. Successful records contain `label`, `path`, `state`, `bare`, `branch`, `detached`, `upstream` (`state`, `name`, `ahead`, `behind`), `changes` (`staged`, `modified`, `untracked`, `conflicted`), `stashes`, `last_commit_age_days`, `last_fetch_age_days`, `default_branch`, `obsolete_branches` and producer `findings`. Repository-wide records additionally carry `worktrees` (`linked`, `prunable`, `detached`); other selected checkouts can omit that group and have no repository-wide branch facts. Obsolete-branch entries contain `name`, `scope`, `reasons`, `age_days` and `automation`. Failed records contain `label`, `path`, `state: "failed"` and `error` instead of invented zero facts.

Keep the parsed document intact as one optional `gitOverview?: unknown` session option. Host acquisition validates process completion and parses stdout JSON only; the existing Harness parser validates the envelope and consumed repository fields, canonicalises paths and selects the target. Preserve `summary`, producer findings, unused fields and future extras without treating them as CLEAN verdicts. The native host owns neither a second JSON schema nor CLEAN rules.

### Command and core wiring

Keep `ki repo audit --skill ki-git`, `ki repo conform --skill ki-git` and all existing repository selectors unchanged. Command modules retain grammar, selection inputs and rendering. Forward the existing injected runner and platform through `repositoryOperationContext`; do not introduce a provider flag, alternate JSON format or new audit-output consumer.

After resolving selected repositories and skills, acquire evidence only for roots whose selected skills include `ki-git`. A core `git-overview.ts` helper invokes `mgit --ignore --physical overview --json` through `KiContext.runner`, with each selected physical root as `cwd`. Extend bounded runner execution with an optional `cwd` forwarded to `spawn`; never change the process-wide directory or invoke a shell. Use a 30-second timeout, 8 MiB output bound and the injected platform. `--ignore` bypasses workspace selection and `--physical` avoids symlink discovery; mgit still follows its supported repository-metadata traversal. Preserve the whole document, including extra repository records. Such records never widen KI audit subjects: existing KI selectors remain authoritative and the catalogue selects only the exact canonical requested root. Verify this boundary with repository-metadata and symlink fixtures rather than assuming the flags disable every traversal.

Gather at most one document per selected physical root per evidence phase, never one per CLEAN criterion. Carry the optional `gitOverview?: unknown` through repository runtime scope and host `RubricContextOptions`, and supply it only to the selected `ki-git` session. Other skills, `educate`, repository selection and the Harness catalogue stay unchanged. The host adds no native CLEAN conditions, stale threshold, branch classifier or deletion proposal generator.

Audit and conform use the same acquisition path. A conform proposal uses its initial immutable document; the existing guarded catalogue supplies disposition guidance and has no CLEAN mutation action. A post-conform re-audit obtains a new document after any writes, once for that evidence phase, rather than declaring old Git evidence fixed. No persistent cache or supplied-file import is introduced.

### Failure, freshness and unknowns

Missing mgit, process rejection, timeout, output overflow, absent stdout or invalid JSON yields no `gitOverview` and a host acquisition warning that names the affected root. Other selected roots continue. Keep the catalogue's resulting unassessed outcomes; an unavailable document is never replaced with an empty repository or zero counts. The host diagnostic is acquisition evidence, not a replacement CLEAN policy or a new cleanup authority.

Parse stdout separately from stderr using the bounded runner result. Exit 0 supplies the document. Exit 1 may supply a partial document with explicit failed records: preserve it unchanged so covered successful roots remain assessable and failed roots remain unassessed. Other exit statuses are acquisition failures. Valid JSON with a wrong envelope, absent target root, failed target record or malformed consumed fields is passed to the catalogue, which fails closed as unavailable; do not repair its shape in native code.

The producer has no collection timestamp. Acquire afresh for each evidence phase and do not invent a timestamp or a cache lifetime in its schema. Preserve `last_fetch_age_days`, including null, and remote-ref qualification in catalogue findings: a new local read does not refresh remote evidence. A non-standard `stale_days` leaves CLEAN-3 unassessed under the catalogue's fixed 30-day contract; the host does not reinterpret it. Missing repository-wide facts leave CLEAN-2, CLEAN-3, CLEAN-5 and CLEAN-6 unassessed on that checkout.

CLEAN-1 and all unsupported facts remain unknown or unassessed. CLEAN-7 remains heuristic because whether a working tree is in use requires judgement. A mechanical pass covers only its stated observed facts; neither mgit's clean count nor KI's audit summary certifies a clean estate. Audit, dry-run conform and ordinary conform must not fetch, push, delete a branch or worktree, drop a stash, remove a path, close a PR or change provider state for CLEAN findings. Cleanup remains a separately approved owner decision naming the item.

## Steps

- [ ] Add bounded runner `cwd` support and core mgit acquisition using the existing injected runner; preserve separate stdout, process limits and error handling, with no direct Git collection.
- [ ] Thread only the optional `gitOverview` document through repository runtime scope and rubric session creation for selected `ki-git`; wire both audit and conform, including fresh post-write re-audit evidence.
- [ ] Add public CLI fixtures covering the schema and failure matrix below; install a test-only archive containing the byte-exact canonical CLEAN/session modules at the verified Harness commit, with provenance hashes, and a minimal session-observer fixture to prove lossless injection. Tests must not read the workstation Harness or contact a provider; no CLEAN policy is copied into product code.
- [ ] Record accepted host behaviour and conformance evidence in the existing repository-audit Specification, document supported evidence and unknowns in the user guide, align the consolidated changelog, complete every declared gate and retain verification evidence in this record before requesting independent review.

## Files touched

Implementation scope is limited to these expected tools-ki paths; this planning run changes only this record.

- `src/core/runtime/runner.ts`: optional bounded execution directory.
- `src/commands/repo/operation-context.ts` and `src/core/repository/operations/types.ts`: forward the injected platform alongside the existing runner.
- `src/core/repository/git-overview.ts` (new): bounded acquisition, stdout JSON parsing and host acquisition diagnostics.
- `src/core/runtime/types.ts`, `src/core/rubric/index.ts` and `src/core/runtime/audit.ts`: optional evidence scope and session property.
- `src/core/repository/operations/audit.ts` and `src/core/repository/operations/conform.ts`: selected-root acquisition, diagnostic attachment and re-audit refresh.
- `src/tests/cli/repo/git-overview.test.ts` and `src/tests/cli/_git_overview_helper.ts` (new): public contract tests and a pinned test-only Harness archive built with the existing archive helper. Use the existing sandbox injected runner; no shared fixture-helper change is planned.
- `docs/specs/repository-audit.md`, `docs/guides/user/repository-operations.md`, `CHANGELOG.md` and this record: accepted host behaviour with conformance evidence, evidence limits, delivered capability and review evidence.

No Harness, mgit, workflow, installer, command grammar, manual grammar or generated inventory change is planned. A newly discovered need beyond these files returns for replanning.

## Verify

### Fixture cases

- Complete envelope with successful and failed records, unrelated paths, escaped labels and extra producer fields: the intended canonical root receives the unchanged object; `summary.clean` cannot override a failing or missing record. Physical/symlink root matching and multiple selected roots prevent cross-root leakage.
- Supported dirty and clean facts: merged and patch-equivalent branches, local gone upstream, remote stale and automation branches, checked-out ahead/behind, stashes, prunable/detached worktrees, staged and untracked counts, bare and detached checkouts. Assert catalogue codes, guarded warning levels and heuristic context through `run(args, context)`, not new native rule functions.
- Missing PR facts, no upstream, unsupported branch/worktree facts, null or old fetch age, secondary checkout without repository-wide fields and non-standard stale threshold: retain judgement or unassessed context and never print an estate-clean claim. Inspect informational findings with `--reporter-levels all`.
- Missing executable, thrown runner, timeout, output overflow, absent stdout, malformed JSON, wrong envelope, missing target, failed target and malformed consumed fields: no false CLEAN pass, source mutation, fallback Git collector, provider call or automatic installation. Exit 1 with a valid partial document retains successful evidence; stderr never contaminates JSON.
- Single repo, explicit roots and duplicate-root rejection, mgit workspace selection, `--estate`, `--territory`, `--principals` and `--filter`: use existing disposable selector fixtures, preserve ordering and skipped-member reporting, and count at most one bounded acquisition per selected root per phase; duplicate-root rejection must precede acquisition. A different selected skill and `educate` make no overview call.
- Audit, conform dry run, ordinary conform and post-write re-audit: unchanged snapshots for proposal generation, refreshed evidence for re-audit, and no CLEAN writes or destructive runner arguments. Fixture source/index bytes and injected network-call counters prove the boundary.

### Gates

Use already installed dependencies with matching lockfiles; do not install or contact a provider to satisfy a gate. Tests enter through the shared `sandbox()` helper and `run(args, context)`; mgit process output is injected and paths, streams, time and platform remain controlled.

For implementation, run `bun run test -- src/tests/cli/repo/git-overview.test.ts`, `bun run test`, `bunx tsc --noEmit`, `bunx biome check`, `bun run test:coverage`, `ki repo audit --skill ki-engineering --repo .` and `ki repo audit --repo .`. Coverage remains 100 percent; do not add unsupported exclusions. Both root and isolated boundary dependencies must already be available. Run the focused authoring check for every changed Markdown file and `git diff --check`.

For this planning unit, require warning-free `ki repo audit --skill ki-work --repo .` and `ki repo audit --skill ki-work-roadmap --repo .`, a focused `ki-authoring` audit and `rumdl check` for this record, and `git diff --check`. Use the run's copied offline audit home with both Capital registrations; never suppress registry findings or change the real registry. Required readiness warnings stop publication of Ready. Runtime implementation tests remain planned, not claimed as delivered by this document.

### Planning verification

On 21 October 2026, the planning run established an unchanged tools-ki baseline at `d5eac480f6b44a7fe0bb1ca1d2b7340decbefcab`: the full isolated repository audit passed with no failure, retaining only the existing CI-1 and MATURITY-1 warnings. Both selected work-adapter audits passed without warnings before and after shaping, and the focused record authoring check passed. Seven mgit overview Bats fixtures and twelve canonical Harness session/CLEAN tests passed locally under network restrictions against disposable fixtures. These prove dependency availability and planning readiness, not a tools-ki implementation or a clean live estate. Final Ready-state adapter and authoring audits plus `git diff --check` remain publication gates for this planning commit.

## Dependencies / blocks

The dependency launch gate is open, based solely on local committed outcomes. The tools-ki queue's L25 CLEAN-HOST-EVIDENCE disposition explicitly left this consumer to offline planning; it did not deliver the wiring. The [received evidence line](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/messages.md) and [accepted blind review](/Users/krisbrown/.local/state/ki/agents/ways-of-working/wow-overnight-review.report.md) preserve the unsupported-fact limits adopted here.

mgit owns collection and the supported document. Its overview implementation `b8e5911` was accepted at `2ca3a8e` and remains in local `78a1b376cab73614ca896602557c3f4b9d4ce6b3`; the [durable overview guide](https://github.com/knowledgeislands/tools-mgit/blob/78a1b376cab73614ca896602557c3f4b9d4ce6b3/README.md) and executable schema/fixtures above establish actual availability independently of a Done label. Those source files were compared with committed blobs without running a live estate overview. All seven focused overview Bats fixtures passed locally on 21 October 2026 under network restrictions, using only disposable repositories; this verifies the supported producer fixtures, not a tools-ki consumer implementation.

The Harness owns policy. Its committed [CLEAN catalogue](https://github.com/knowledgeislands/ki-agentic-harness/blob/b91fa71dba7ea902e7c1fa8eefa9d515e226a741/skills/governance/ki-git/scripts/rubric/items/clean.ts), [session fixtures](https://github.com/knowledgeislands/ki-agentic-harness/blob/b91fa71dba7ea902e7c1fa8eefa9d515e226a741/skills/governance/ki-git/scripts/rubric/contexts/git.test.ts) and [CLEAN fixtures](https://github.com/knowledgeislands/ki-agentic-harness/blob/b91fa71dba7ea902e7c1fa8eefa9d515e226a741/skills/governance/ki-git/scripts/rubric/items/clean.test.ts) define guarded WARN findings, missing-evidence handling and schema consumption. The local active catalogue and fixtures were byte-compared against that commit. No new policy dependency is outstanding and no cross-repository roadmap identifier is added to dependency metadata.

## Documentation impact

### Decision Records

No new decision record: Kris already confirmed the owner split under TOOLS-KI-SHAPES a), recorded in the [23:16 BST decision](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md#2026-10-20-2316-bst---query-sign-offs-first-batch). Acquisition and lossless session injection implement that decision within existing command/core boundaries.

### Specifications

Add the accepted host acquisition, lossless session injection, failure and no-cleanup behaviour to the existing repository-audit Specification, with the public CLI fixtures as verification and honest conformance evidence. No portable mgit schema, Harness policy, audit output format or contract version changes. Any proposed portable contract change returns to its owning repository.

### Guides

Update the repository-governance user guide to explain the mgit prerequisite, observed-fact scope, unassessed cases, fetch-age qualification and separate cleanup approval. No new command grammar or release procedure is introduced.

### Roadmap

Retain this existing record as the implementation and review home, preserve its identity and creation time, and advance only its plan metadata. No new record, dependency ID, acceptance, cancellation or prune follows from this planning grant. Implementation must establish its own immutable baseline when separately launched.

## Discussion

Capture only; adoption, priority and plan belong to this repository. Questions for planning: whether open-PR facts come from `gh` behind an injected provider or stay out of scope offline; whether the Git fact collection belongs in `ki` or as a read-only `mgit` report that `ki` consumes; and the stale-age threshold.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, whose Scope lists this record as the one REPO-GIT-HYGIENE capture inside its burn-to-zero, under the tools-burndown thread's BURN-OVERNIGHT decision. Planning waits on the ki-git rubric dependency above.

Reworded on 18 October 2026 by the tools-burndown run: the roadmap overview's ESTATE-HOME query recommended a), "mgit owns `mgit overview`, terminal table and `--json`, copying git-almanac's output conventions. KI-TOOL-KI-CLI-140 reworded to read mgit's JSON, and git-almanac stays single-repository". The run took a) under Kris's overnight instruction to take the recommended course on a judgement call; provisional, for Kris to confirm. That answers the planning question of where Git fact collection belongs.

### Agreed check ownership

Kris confirmed TOOLS-KI-SHAPES a) on 20 October 2026 at 23:16 BST in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md#2026-10-20-2316-bst---query-sign-offs-first-batch). The harness owns the mechanical CLEAN checks; tools-ki composes them with mgit facts. This settles the check home without planning or implementing this draft. The harness follow-up goes to `ki.ways-of-working`, which owns `ki-git`.
