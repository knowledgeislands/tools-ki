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
updated_at: 2026-10-16T21:10:00Z
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

Read at `0f61dd83` on 16 October 2026; the Context above still holds.

- `footer` (`src/core/agent/runs.ts:72`) slices from `text.indexOf('## Rules')`. The harness's four `rules-*.md` assets on `ki-agentic-harness` `origin/main` still open with an intro line that mentions "`## Rules` onwards" before the heading, so every composed prompt starts its footer mid-sentence and keeps relative links such as `../references/standards-background-runs.md` that do not resolve from a prompt. The contract-test fixture in `src/tests/cli/agent.test.ts` has a preamble without the marker, so the tests do not catch it.
- `composePrompt` (`runs.ts:166`) names `reportPath(thread, name)` in the progress protocol. Since the thread-home work, `ki agent new` drafts name the same thread-folder path, so a split now comes only from a hand-written brief that names the state-folder or another path for the same `<name>.report.md`.
- `--rules` (`src/commands/agent/index.ts:65`) accepts `authorityTiers` (`none`, `push`, `prune`, `release`, `src/core/agent/context.ts:9`), one asset each. The harness has no grant or tier asset for fetch without push or for an approved machine change, and no harness record proposes one.

## Decision

1. **Marker.** The footer starts at the first line that is exactly `## Rules`, so the fix holds whatever the intro line says and needs no harness change. Relative Markdown link targets in the footer are rewritten to absolute paths resolved from the asset's own folder, so they open from a prompt.
2. **One report path.** The progress protocol keeps the thread-folder path. Launch warns, and still launches, when the brief names a `<name>.report.md` in any other folder, naming both paths. The protocol adds that its report path governs. A warning rather than a refusal, because a brief may cite other agents' reports and a reviewed brief is the owner's to correct.
3. **Authority (approved by Kris; needs the harness).** Orthogonal grants rather than a fifth tier: `--allow fetch` and `--allow machine`, repeatable beside `--rules <tier>`, each appending a harness-owned `assets/grant-<name>.md` section that names what it permits and states that it overrides the tier's matching prohibition. Fetch-without-push and an approved local change are not steps on the cumulative publication ladder (`push` already allows fetch; no tier allows a machine change), so a fifth tier would either break the ladder or duplicate it. A footer that simply defers to the brief was rejected: it turns every footer into advice and loses the launcher's guarantee.

## Steps

- [ ] `footer`: find `/^## Rules$/m`; rewrite relative link targets against the asset folder; keep the existing error when no such line exists.
- [ ] Contract-test fixture: give the fixture preamble the "`## Rules` onwards" mention and a relative link, so the tests pin both fixes.
- [ ] `composePrompt`: scan the brief for paths ending `/<name>.report.md` or a bare `<name>.report.md` outside `+/_THREADS/<run>/`; return a launch warning naming both paths; add "This is the only report path; it governs any other the brief names." to the protocol.
- [ ] `ki agent launch` and `ki agent queue` print the warning on stderr, exit 0.
- [ ] Once the harness ships the agreed grant assets: `grantNames` in `context.ts`, `--allow <grant>` (repeatable, choices) in `src/commands/agent/index.ts`, carried through `LaunchRequest`, the queue file and the hold relaunch; `composePrompt` appends each grant section after the tier footer; a missing grant asset fails like a missing tier.
- [ ] `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

`src/core/agent/runs.ts`, `context.ts`; `src/commands/agent/index.ts`; `src/tests/cli/agent.test.ts`; `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. With a fixture footer whose intro mentions "`## Rules` onwards" and links `../references/x.md`, the composed prompt's footer begins with the `## Rules` heading line and the link is absolute under the fixture harness.
2. A footer with no exact `## Rules` line still fails with the existing message.
3. A brief naming `<state folder>/one.report.md` launches with a stderr warning naming both paths; a brief naming the thread-folder path, or another agent's report, draws none; the protocol carries the "governs" sentence.
4. `--allow fetch --allow machine` appends both grant sections after the tier footer in that order, survives `ki agent queue` and the dispatcher, and the hold relaunch; an unknown grant is rejected by the option parser; a missing grant asset fails naming it.
5. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- **Blocked on the harness (FOOTER-GRANTS):** Kris approved Decision 3's shape on 16 October 2026; it needs `grant-fetch.md` and `grant-machine.md` in `ki-agentic-harness` `skills/governance/ki-delegation/assets/` with the background-run standard's tier table updated. The harness owner opens a `ki-delegation` record for the two grant texts; set Ready once those texts are agreed.
- Shares `src/core/agent/runs.ts` with [KI-TOOL-KI-CLI-135](KI-TOOL-KI-CLI-135-reused-agent-name-overwrites.md) and [KI-TOOL-KI-CLI-137](KI-TOOL-KI-CLI-137-agent-run-tmp-home.md); deliver after KI-TOOL-KI-CLI-135.

## Documentation impact

### Decision Records

None in `tools-ki`; the grant semantics belong to the harness `ki-delegation` standard.

### Specifications

None.

### Guides

`README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`: the report-path warning and `--allow`.

### Roadmap

None.

## Discussion

Origin: the `sol` bring-up, captured on Kris Brown's TOOL-RECORDS approval on 2026-10-14 (decision 70 in the thread's decisions log). The planning choice is between a fifth cumulative tier (for example `local`: fetch and approved machine changes, no push), orthogonal grants (`--allow fetch --allow machine`), or a footer that defers explicitly to the brief's cited decision. A brief that is stricter than its footer is safe; a footer stricter than an approved brief costs a stop or an ignored rule, and an agent that learns to ignore the footer is the worse outcome. Capture only; adoption, priority and plan belong to this repository.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned on 16 October 2026 in the tools-burndown thread: the marker and report-path fixes are settled; the authority shape is recommended as orthogonal grants and waits on Kris and a harness asset, so the record stays draft.

Kris Brown answered FOOTER-GRANTS on 16 October 2026: this record delivers separate `--allow fetch` and `--allow machine` grants beside `--rules <tier>`, each a harness-owned section that lifts only the matching ban. The harness owner opens a `ki-delegation` record for the two grant texts, and KI-TOOL-KI-CLI-134 becomes Ready once that is agreed; until then it stays draft.
