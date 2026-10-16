---
id: KI-TOOL-KI-CLI-134
area: CLI
title: Launch footer follows brief
project: tools-burndown
purpose: corrective
kind: deliver
component: agent
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T17:05:00Z
updated_at: 2026-10-16T01:15:23Z
---

# Launch Footer Follows Brief

## Goal

The prompt `ki agent launch` composes never contradicts the brief it wraps. The appended authority footer matches the authority the owner approved, including a local machine change or a `git fetch` with no push, and the progress protocol names the same report path as the brief, so an agent is never left choosing between two instructions.

## Context

In the mac-studio-bootstrap thread on 14 October 2026 (difference D38 in the run report `rig-guide.report.md`, item 12 in `sol-fix.report.md`), Kris approved a `sol-fix` run that fetched and changed `sol` directly. `ki agent launch` appended the `none` footer, which says "No remote call of any kind: no Git fetch ... Make no environment, scheduler or credential change", and its progress protocol named the thread-folder report path while the brief named the state-folder one. The agent followed the brief and the decisions log and wrote its report to both paths. Later briefs in the same thread now carry a workaround clause ("where an appended generic footer is stricter about fetch or local changes, this brief governs"), and the `tool-records` run that captured this record had the same report-path split.

What `ki agent` does today:

- [`composePrompt`](../../src/core/agent/runs.ts) appends `footer(context, request.rules)` and a progress protocol whose report path is always `reportPath(thread, name)` in the tracked thread folder. It does not read the brief's own report path or authority.
- The four tiers in [`authorityTiers`](../../src/core/agent/context.ts) (`none`, `push`, `prune`, `release`) come from the `ki-delegation` skill in `ki-agentic-harness`, whose background-run standard defines them as cumulative remote-publication grants. `push` is the only tier that allows `git fetch`, and it also allows pushing. No tier allows a local environment change, so an approved machine fix has no footer that matches it.
- `footer` slices the asset from the first occurrence of `## Rules`. Each `rules-*.md` asset mentions "`## Rules` onwards" in its intro line before the heading, so every composed prompt begins its footer with that stray fragment and a relative link to the standard that does not resolve from the prompt.

## Boundary

- In (tools-ki): composing a prompt whose footer and protocol agree with the brief: either a tier, or a set of named grants, that covers local machine changes and fetch-without-push, selected at launch; one report path, taken from the brief or the thread home, used throughout; extracting the footer from the `## Rules` heading itself rather than the first mention; a launch-time warning or refusal when the brief names a different report path; contract tests through `run(args, context)`.
- In (ki-agentic-harness, handoff): the `ki-delegation` standard and assets define whichever new tier or grant wording is chosen, and the intro lines stop matching the footer marker. The harness owns that change; this record only consumes it.
- Out: inferring authority from free text in the brief; changing what any existing tier grants; the decisions-log format.

## Current state

Adopted to `next` as a draft on 16 October 2026 and not yet planned; `ki-plan` records the current state before this record becomes Ready.

## Steps

- [ ] Shape this record through `ki-plan`; no delivery step is planned yet.

## Files touched

Not yet determined.

## Verify

Not yet set. The plan names the exact gates; at minimum the repository test suite through `run(args, context)` and the `ki-engineering` audit.

## Dependencies / blocks

Not blocked to plan. Delivery of a new tier depends on the matching `ki-delegation` asset in `ki-agentic-harness`; the footer-marker fix and the report-path agreement do not.

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

Origin: the `sol` bring-up, captured on Kris Brown's TOOL-RECORDS approval on 2026-10-14 (decision 70 in the thread's decisions log). The planning choice is between a fifth cumulative tier (for example `local`: fetch and approved machine changes, no push), orthogonal grants (`--allow fetch --allow machine`), or a footer that defers explicitly to the brief's cited decision. A brief that is stricter than its footer is safe; a footer stricter than an approved brief costs a stop or an ignored rule, and an agent that learns to ignore the footer is the worse outcome. Capture only; adoption, priority and plan belong to this repository.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.
