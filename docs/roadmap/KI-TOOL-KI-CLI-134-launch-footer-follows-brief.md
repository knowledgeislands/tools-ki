---
id: KI-TOOL-KI-CLI-134
area: CLI
title: Launch footer follows brief
project: tools-burndown
purpose: corrective
kind: deliver
size: l
component: agent
status: done
blocks: []
blocked_by: []
baseline_ref: 0e48ca277d7e784affb7806d646df313345742c4
created_at: 2026-10-14T17:05:00Z
updated_at: 2026-10-20T22:23:20Z
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

## Requirements

1. The progress protocol `composePrompt` writes asks for the owner report without a reply block: its report sentence drops "with the reply block" from "outstanding queries with the reply block", because the ki-pmo owner report carries no reply block and the owner answers in speech.

## Current state

Read at `0f61dd83` on 16 October 2026; the Context above still holds.

- `footer` (`src/core/agent/runs.ts:72`) slices from `text.indexOf('## Rules')`. The harness's four `rules-*.md` assets on `ki-agentic-harness` `origin/main` still open with an intro line that mentions "`## Rules` onwards" before the heading, so every composed prompt starts its footer mid-sentence and keeps relative links such as `../references/standards-background-runs.md` that do not resolve from a prompt. The contract-test fixture in `src/tests/cli/agent.test.ts` has a preamble without the marker, so the tests do not catch it.
- `composePrompt` (`runs.ts:166`) names `reportPath(thread, name)` in the progress protocol. Since the thread-home work, `ki agent new` drafts name the same thread-folder path, so a split now comes only from a hand-written brief that names the state-folder or another path for the same `<name>.report.md`.
- **Delivered on 18 October 2026 (Decisions 1 and 2).** `footer` now starts at the `## Rules` heading line and makes relative link targets absolute from the asset folder; launch and queue warn on standard error when the brief names this agent's `<name>.report.md` in another folder, and the protocol says its path governs.
- `--rules` (`src/commands/agent/index.ts:65`) accepts `authorityTiers` (`none`, `push`, `prune`, `release`, `src/core/agent/context.ts:9`), one asset each. The harness has no grant or tier asset for fetch without push or for an approved machine change, and no harness record proposes one.

## Decision

1. **Marker.** The footer starts at the first line that is exactly `## Rules`, so the fix holds whatever the intro line says and needs no harness change. Relative Markdown link targets in the footer are rewritten to absolute paths resolved from the asset's own folder, so they open from a prompt.
2. **One report path.** The progress protocol keeps the thread-folder path. Launch warns, and still launches, when the brief names a `<name>.report.md` in any other folder, naming both paths. The protocol adds that its report path governs. A warning rather than a refusal, because a brief may cite other agents' reports and a reviewed brief is the owner's to correct.
3. **Authority (approved by Kris; needs the harness).** Orthogonal grants rather than a fifth tier: `--allow fetch` and `--allow machine`, repeatable beside `--rules <tier>`, each appending a harness-owned `assets/grant-<name>.md` section that names what it permits and states that it overrides the tier's matching prohibition. Fetch-without-push and an approved local change are not steps on the cumulative publication ladder (`push` already allows fetch; no tier allows a machine change), so a fifth tier would either break the ladder or duplicate it. A footer that simply defers to the brief was rejected: it turns every footer into advice and loses the launcher's guarantee.

## Steps

- [x] `footer`: find `/^## Rules$/m`; rewrite relative link targets against the asset folder; keep the existing error when no such line exists.
- [x] Contract-test fixture: give the fixture preamble the "`## Rules` onwards" mention and a relative link, so the tests pin both fixes.
- [x] `composePrompt`: scan the brief for paths ending `/<name>.report.md` outside the thread folder (a bare `<name>.report.md` names no folder and draws no warning); return a launch warning naming both paths; add "This is the only report path; it governs any other the brief names." to the protocol.
- [x] `ki agent launch` and `ki agent queue` print the warning on stderr, exit 0.
- [x] Once the harness ships the agreed grant assets: `grantNames` in `context.ts`, `--allow <grant>` (repeatable, choices) in `src/commands/agent/index.ts`, carried through `LaunchRequest`, the queue file and the hold relaunch; `composePrompt` appends each grant section after the tier footer; a missing grant asset fails like a missing tier; `README.md`, `man/ki.1`, `man/ki.commands.json`, the guide and `CHANGELOG.md` describe `--allow`.
- [x] `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md` describe the footer and report-path fixes.
- [x] Requirement 1: drop "with the reply block" from the progress protocol in `composePrompt` (`src/core/agent/runs.ts`), update the contract tests that pin the protocol text, and note the change in `CHANGELOG.md`.

## Files touched

`src/core/agent/runs.ts`, `context.ts`; `src/commands/agent/index.ts`; `src/tests/cli/agent.test.ts`; `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. With a fixture footer whose intro mentions "`## Rules` onwards" and links `../references/x.md`, the composed prompt's footer begins with the `## Rules` heading line and the link is absolute under the fixture harness.
2. A footer with no exact `## Rules` line still fails with the existing message.
3. A brief naming `<state folder>/one.report.md` launches with a stderr warning naming both paths; a brief naming the thread-folder path, or another agent's report, draws none; the protocol carries the "governs" sentence.
4. `--allow fetch --allow machine` appends both grant sections after the tier footer in that order, survives `ki agent queue` and the dispatcher, and the hold relaunch; an unknown grant is rejected by the option parser; a missing grant asset fails naming it.
5. The composed progress protocol asks for outstanding queries and no longer contains "reply block".
6. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- **Harness grants shipped (handoff, 18 October 2026):** `ki-agentic-harness` `main` at `ef9d275f` carries the approved `grant-fetch.md` and `grant-machine.md` in `skills/governance/ki-delegation/assets/`, listed in the background-run standard's [Grants](https://github.com/knowledgeislands/ki-agentic-harness/blob/ef9d275f/skills/governance/ki-delegation/references/standards-background-runs.md#grants) subsection. To build the open Step: `grantNames = ['fetch', 'machine']` mirrors the standard's table; slice each asset from the line that is exactly `## Grant: <name>` (not `## Rules`), rewriting its relative links as for the footer; append each section after the tier footer in `--allow` order. Once the option ships, the harness standard's interim rule that a brief appends a grant section by hand can go. The harness gate is cleared, so the open grants Step can proceed.
- Shares `src/core/agent/runs.ts` with [KI-TOOL-KI-CLI-135 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/a22214ee581b73a1f395da88f9a118ad89814bb9/docs/roadmap/KI-TOOL-KI-CLI-135-reused-agent-name-overwrites.md) and [KI-TOOL-KI-CLI-137 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/a22214ee581b73a1f395da88f9a118ad89814bb9/docs/roadmap/KI-TOOL-KI-CLI-137-agent-run-tmp-home.md); deliver after KI-TOOL-KI-CLI-135.

## Documentation impact

### Decision Records

None in `tools-ki`; the grant semantics belong to the harness `ki-delegation` standard.

### Specifications

None.

### Guides

`README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`: the report-path warning and `--allow`.

### Roadmap

None.

## Review

### Delivered

The whole record, from immutable baseline `0e48ca277d7e784affb7806d646df313345742c4` (`feat(agent): give each agent a temporary folder that close removes`, 18 October 2026), the parent of the first delivery commit. Decisions 1 and 2 landed on 18 October 2026 as `df1c24ed60342c2d9d194bebee9970ab3974bede`; the `burn-tools-ki` run delivered Decision 3's `--allow` grants and Requirement 1 on 20 October 2026 from `f2fdf227`, on branch `run/burn-tools-ki`, as `a14a328d532ffc61e1bf5af76ffef0184f191b5a`.

### Change Summary

- `src/core/agent/context.ts`: `grantNames = ['fetch', 'machine']`, mirroring the background-run standard's Grants table.
- `src/core/agent/runs.ts`: `LaunchRequest.allow`; `grant` slices each `grant-<name>.md` from its exact `## Grant: <name>` line, makes relative links absolute as the footer does, and fails naming the grant when the heading is missing; `composePrompt` appends the sections after the tier footer in `--allow` order; the progress protocol asks for "outstanding queries" with no reply block.
- `src/commands/agent/index.ts`: `--allow <grant>` on `launch` and `queue`, repeatable, checked against the choices and listed in help.
- The queue file carries `allow`, so the dispatcher composes the same prompt; a queue line written before the option, with no `allow`, dispatches with no grant. The hold process starts from the already composed `<name>.prompt.md`, so a held agent keeps its grants without a new hold argument.
- `src/tests/cli/agent.test.ts`: grant fixtures beside the tier footers; order and absolute links, an unknown grant, a missing or mis-headed grant asset, the held launch, the queue and dispatcher, and the protocol wording.
- `README.md`, `man/ki.1`, the regenerated `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md` describe `--allow` and the protocol wording.

### Verification

- **Verify 1, 2:** Covered since 18 October by the footer cases in `ki agent launch`; still passing
- **Verify 3:** The report-path warning cases; still passing
- **Verify 4:** `appends each --allow grant after the tier footer in the order given`, the held launch with `--allow fetch`, and `carries the model, effort and grants through the queue to the launched runtime`; the missing-asset cases name the grant; an unknown grant exits 2 from the option parser
- **Verify 5:** The first launch case asserts `outstanding queries), then write DONE` and no "reply block"
- **Verify 6:** `bun run test:coverage` 1,373 tests at 100% statements, branches, functions and lines, and 1,398 after rebasing onto `75427fa2`; `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and the command-inventory check pass; `ki repo audit --repo .` on the integrated primary checkout reports one failure, the review-packet shape of KI-TOOL-KI-CLI-165 from another session's `f2fdf227`, which this record does not touch

### Outstanding concerns

- The harness `ki-delegation` Grants subsection keeps its interim sentence under GRANT-INTERIM a) until a `ki` release carries `--allow`; its removal is carried as a `messages.md` line to `ki.ways-of-working` in Knowledge Islands Principal under CAPTURE-GATE, not as a record.
- Kris confirmed all three provisional choices on 20 October 2026 at 23:16 BST: marker and report-path fixes before the grants; no warning for a bare `<name>.report.md`; each differing report path named once.
- Release installation and the interim-sentence removal remain with [ki.tools-burndown](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/work.md) and [ki.ways-of-working](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/work.md), whose live work carries them. This acceptance does not authorise a release.

### Post-change review

A grant lifts exactly one ban by appending harness-owned text, so the launcher still guarantees what each agent is told and no footer defers to free text in a brief. Composing grants at launch rather than at hold or dispatch keeps one prompt per agent.

### Mini recap

`ki agent launch` and `queue` take `--allow fetch` and `--allow machine`, appending the harness grant sections after the tier footer, and the progress protocol no longer asks for a reply block.

## Done

Accepted 20 October 2026 by Kris Brown on the review packet above.

## Discussion

Origin: the `sol` bring-up, captured on Kris Brown's TOOL-RECORDS approval on 2026-10-14 (decision 70 in the thread's decisions log). The planning choice is between a fifth cumulative tier (for example `local`: fetch and approved machine changes, no push), orthogonal grants (`--allow fetch --allow machine`), or a footer that defers explicitly to the brief's cited decision. A brief that is stricter than its footer is safe; a footer stricter than an approved brief costs a stop or an ignored rule, and an agent that learns to ignore the footer is the worse outcome. Capture only; adoption, priority and plan belong to this repository.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned on 16 October 2026 in the tools-burndown thread: the marker and report-path fixes are settled; the authority shape is recommended as orthogonal grants and waits on Kris and a harness asset, so the record stays draft.

Kris Brown answered FOOTER-GRANTS on 16 October 2026: this record delivers separate `--allow fetch` and `--allow machine` grants beside `--rules <tier>`, each a harness-owned section that lifts only the matching ban. The harness owner opens a `ki-delegation` record for the two grant texts, and KI-TOOL-KI-CLI-134 becomes Ready once that is agreed; until then it stays draft.

Decisions 1 and 2 delivered on 18 October 2026 by the tools-burndown run under Kris Brown's overnight instruction to burn down the tools roadmap; the record stays in progress for the grants, which wait on [KI-HARNESS-GOV-201](https://github.com/knowledgeislands/ki-agentic-harness/blob/f7982a61/docs/roadmap/KI-HARNESS-GOV-201-fetch-and-machine-grants.md) (triage) for the agreed `grant-fetch.md` and `grant-machine.md` texts. Provisional, for Kris to confirm: delivering the two fixes ahead of the grants; a bare `<name>.report.md` draws no warning; the warning names each differing path once. The four `rules-*.md` assets on `ki-agentic-harness` main still carry the "`## Rules` onwards" intro mention, so the marker fix takes effect at once.

Kris Brown folded COMPOSE-REPLY-BLOCK into this record on 18 October 2026, recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) as COMPOSE-REPLY-BLOCK a): fold the reply-block wording fix into KI-TOOL-KI-CLI-134. The launch prompt tools-ki writes still asks for "outstanding queries with the reply block", which the owner report no longer carries; Requirement 1, its Step and Verify 5 add the fix. Recorded by the `release-ki` run, which does not build it; the record stays in progress.

Kris Brown answered GRANT-INTERIM on 18 October 2026, recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, recap batch", 17:59 BST) as GRANT-INTERIM a): keep the interim sentence in the harness `ki-delegation` Grants subsection, under which a brief appends a grant section by hand after its footer, and remove it when `--allow` ships. When this record delivers `--allow`, its review packet names the sentence's removal as the harness follow-up, so the hand-append route ends with the release that carries the option.

### Independent acceptance, 20 October 2026

Independent acceptance failed against the immutable delivery-evidence requirement: `baseline_ref` names `0e48ca2764f7ab3eb9a54b99b4a8e2a40aa4edc8`, which does not resolve to a commit in this non-shallow checkout after `git fetch -q origin`. This review does not infer a replacement baseline. The delivery owner must supply the correct immutable evidence before resubmission. Outstanding concerns also explicitly leaves three provisional choices for Kris to confirm: delivering the fixes ahead of the grants, no warning for a bare report filename, and naming each differing report path once. Those remain for Kris. The independently run coverage gate passed all 1,398 tests in 85 files at 100% statements, branches, functions and lines; TypeScript, Biome, rumdl, Knip, manual lint, command inventory and Syncpack passed. The code checks do not replace either missing evidence or the owner decision. Returned to in-progress under the review brief of 20 October 2026.

### Baseline evidence repair, 20 October 2026

The `burn2-tools-ki` run traced the unresolvable `baseline_ref`: its first eight characters match commit `0e48ca277d7e784affb7806d646df313345742c4`, but the remaining characters had been written incorrectly. That commit is the sole parent of `df1c24ed60342c2d9d194bebee9970ab3974bede`, the commit that delivered Decisions 1 and 2 and the first delivery commit for this record, so it is the immutable baseline of execution. `baseline_ref` and Delivered now name it in full, and Delivered names both delivery commits. No code changed. The three provisional choices remain for Kris under FOOTER-PROVISIONALS. The record returns to awaiting review.

### Independent re-review, 20 October 2026

The independent `accept4-tools-ki` review verified that the repaired full `baseline_ref` resolves to the sole parent of the first delivery commit, and that both delivery commits are ancestors of the reviewed primary checkout. The Review packet has exactly the required six headings, and every planned Step is complete. The independently run coverage gate passed all 1,398 tests in 85 files at 100% statements, branches, functions and lines; TypeScript, Biome, rumdl, Knip, manual lint, command inventory and both Syncpack checks passed. The complete repository audit passed with zero failures and seven warnings after running it sequentially with coverage; an earlier overlapping invocation refused the occupied coverage directory and was rerun without bypass. No technical defect was reproduced.

The record remains awaiting review because Outstanding concerns expressly reserves three choices for Kris at acceptance: delivering the marker and report-path fixes before the grants, no warning for a bare report filename, and naming each differing report path once. The existing FOOTER-PROVISIONALS query in the [ways-of-working queries](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/queries.md) still carries that decision; the overnight grant excludes checks needing Kris personally. No acceptance or pruning is recorded for this item.

### Owner confirmation, 20 October 2026

Kris confirmed FOOTER-PROVISIONALS a) at 23:16 BST in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md#2026-10-20-2316-bst---query-sign-offs-first-batch): the marker and report-path fixes were delivered before the grants; a bare `<name>.report.md` gives no warning; and each differing report path is named once. All three are confirmed as implemented. The sign-off brief grants independent acceptance and, on a pass, pruning for this record only, overriding its general acceptance and pruning ban.

### Independent sign-off review, 20 October 2026

The independent `wow-signoff-toolski` run reviewed delivery at `a0cadb9f1ad9b1ee513b41d837f83834e6301fa5` without delivering it. Exact predicates verified the six Review headings, all seven completed Steps, the immutable baseline as the sole parent of the first delivery commit, and both delivery commits as ancestors of the reviewed checkout. The launch contract cases exercise exact footer and grant markers, absolute links, bare report filenames, repeated conflicting paths, queue and hold behaviour, invalid grants and the protocol wording. The later state-folder-only report rule deliberately supersedes the original thread-folder destination; current tests and the user guide agree. No technical defect remains.

Independent gates passed: all 1,405 tests in 86 files with 100% statements, branches, functions and lines; TypeScript; Biome; Knip; manual lint; command inventory; Syncpack lint and format; and the complete baseline repository audit with zero failures and six existing warnings. The first worktree coverage attempt lacked its nested boundary-tool dependencies; linking the already installed dependency tree and rerunning the complete gate passed without a network call. Roadmap and authoring audits passed with no failures; the authoring template drift warning is pre-existing. The judgement review found the goal, delivery scope, dependency ownership and honest lifecycle coherent.

Kris's 23:16 BST FOOTER-PROVISIONALS a) confirmation and the record-specific acceptance grant cover this exact record. On the passing independent review, the run records that approved acceptance. The remaining release and harness follow-up survive in the live works linked above. Inbound reference preflight searches the accessible Knowledge Islands checkout roots and the installed harness; six live links in Knowledge Islands Principal require pinning before the dedicated prune commit. The archived repositories named by Known Lands are unavailable locally and were retired on 4, 5 and 11 October, before this record was created on 14 October; no claim is made to having searched those archives.
