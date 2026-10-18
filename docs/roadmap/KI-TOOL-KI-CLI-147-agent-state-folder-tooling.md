---
id: KI-TOOL-KI-CLI-147
area: CLI
title: Agent state-folder tooling
project: tools-burndown
purpose: corrective
kind: deliver
component: agent
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: aa185bf7f56c97ba0e0bb4d61ecbbe978d29bb88
created_at: 2026-10-18T05:30:00Z
updated_at: 2026-10-18T06:10:00Z
---

# Agent State-Folder Tooling

## Goal

`ki agent` keeps the run state folder tidy without hand work: a run report defaults to the run's state folder, briefs are not stored twice, `_archive/` keeps a bounded history and a sweep prunes what has outlived it.

## Context

At 22:50 BST on 17 October 2026, in the ways-of-working thread (TOOLS-PUSH), Kris Brown said: "the tools-ki state tooling joins KI-TOOL-KI-CLI-137." The ways-of-working restart design names that tooling as:

- the report path default (a run report written to the run's state folder);
- de-duplicated briefs;
- `_archive/` retention;
- sweep pruning.

[KI-TOOL-KI-CLI-137](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-137-agent-run-tmp-home.md) carried it unplanned. The tools-burndown run split it out on 18 October 2026, so that the temporary home could be delivered on its own. The split is provisional, for Kris to confirm.

## Boundary

- In: the four items above, in `src/core/agent/` and its commands, with tests through `run(args, context)` and the manual, guide and changelog.
- Out: the temporary folder, which KI-TOOL-KI-CLI-137 delivers; and the thread-folder closed list and run-packet wording, which the harness owns.
- Adopted into Now on 18 October 2026 under fable-opinion-2: "KI-TOOL-KI-CLI-147, agent state-folder tooling... Adopt and plan provisionally, build to Awaiting review." The adoption is provisional, for Kris to confirm.

## Current state

Read at `aa185bf7` on 18 October 2026.

- **Report path.** `reportPath` (`src/core/agent/thread.ts:56`) is the tracked work or thread folder, and the progress protocol `composePrompt` writes (`src/core/agent/runs.ts:224`) names it, so each agent writes straight into the tracked folder. The harness standard (`ki-delegation` `standards-background-runs.md`, Run packet) now says "A run report is written to the run's state folder, and the launcher copies it into the owning work folder". `adoptStateFiles` already moves a state-folder report into the tracked folder at `decide` and `close`, unless the tracked folder holds it or Git ever has.
- **Briefs.** `queueAgent` copies the brief to `<name>.queued.md` (`runs.ts:478`) and `newPrompt` writes `<name>.draft.md` (`runs.ts:676`); the launch composes `<name>.prompt.md`, which holds the whole brief, and leaves the queued or draft copy in place. The live ways-of-working state folder holds about sixty `.queued.md` files, each a byte copy of a brief also held in that agent's `.prompt.md`.
- **`_archive/`.** `closeRun` (`src/core/agent/close.ts`) moves a closed run to `_archive/<run>/`, or writes `_archive/<run>.tar.gz` with `--compress`, or deletes it with `--delete`, and writes a close note (`_archive/<run>/close.md` or `_archive/<run>.close.md`). Nothing ever removes an archived run.
- **Sweep.** No verb removes anything from the state folders.

## Decision

All four answers are provisional, for Kris to confirm.

1. **Report default.** The progress protocol names `<state>/<name>.report.md`. When the launcher first observes the agent's `DONE`, it copies the report into the work or thread folder, so the coordinator reads and commits it there as before; it overwrites a tracked copy only when Git holds that copy unchanged, as after a relaunch. Readers keep looking in the tracked folder first, so an agent launched under the old protocol still reports where it was told. A brief that names the tracked copy draws no warning.
2. **One brief copy.** A launch from `<name>.queued.md` or `<name>.draft.md` removes that file once the runtime or hold process has started, because `<name>.prompt.md` then holds the brief. A failed launch keeps it. The coordinator's own brief, such as `briefs/<name>.md`, is never touched.
3. **Retention.** `_archive/` keeps the ten most recently closed runs, counted by run: a run's folder, tarball and close note go together. The age of a closed run is its close note's modification time.
4. **Sweep.** A separate verb, `ki agent sweep [--keep <n>] [--write]`, previews by default and with `--write` removes the archived runs beyond the newest `<n>` (default 10) and each open run's leftover `.queued.md` or `.draft.md` beside a `.prompt.md`. `close` stays as it is: it retires one run, and the sweep is the housekeeping across all of them.

## Steps

- [ ] Core: `stateReportPath(context, run, name)` in `src/core/agent/thread.ts`; the progress protocol in `launchAgent` names it; `reportConflicts` accepts both the state and the tracked report paths.
- [ ] Core: on an attempt's first observed `DONE` in `agentChanges` (`src/core/agent/events.ts`), copy the state-folder report into the tracked folder when it has none or Git holds its copy unchanged.
- [ ] Core: `launchAgent` removes the `.queued.md` or `.draft.md` it launched from after a successful start.
- [ ] Core: `sweepAgents` in a new `src/core/agent/sweep.ts`, returning the files it would remove or removed.
- [ ] Command: `ki agent sweep [--keep <n>] [--write]` in `src/commands/agent/index.ts`.
- [ ] Contract tests through `run(args, context)` and `sandbox()` (see Verify).
- [ ] Documentation: `man/ki.1` and regenerated `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

- `src/core/agent/thread.ts`, `runs.ts`, `events.ts`, new `sweep.ts`
- `src/commands/agent/index.ts`
- `src/tests/cli/agent.test.ts`, `agent-events.test.ts`, new `agent-sweep.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md`, `CHANGELOG.md`

## Verify

1. A launched agent's prompt names `<state>/<name>.report.md`; a brief naming either that path or the tracked copy draws no warning, and any other path still does.
2. An agent that writes its report to the state folder and `DONE`: the next `ki agent wait` or `status` copies the report into the tracked folder, reports `done` and its queries; a tracked copy with uncommitted changes is left alone; an agent launched under the old protocol, with its report already in the tracked folder, is reported as before.
3. A launch from the queue or a draft leaves `<name>.prompt.md` and no `.queued.md` or `.draft.md`; a queued launch that fails keeps its `.queued.md`.
4. `ki agent sweep` previews the archived runs beyond `--keep` and the leftover briefs and changes nothing; `--write` removes exactly those; a folder, tarball and close note of one run go together; `--keep` rejects a value below 1.
5. Gates: `bun run test:coverage` at 100%, `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, the command-inventory check and `ki repo audit --repo .`.

## Dependencies / blocks

None open. [KI-TOOL-KI-CLI-137](KI-TOOL-KI-CLI-137-agent-run-tmp-home.md), awaiting review, delivered the temporary folder this record leaves out; the two touch the same launcher but neither needs the other.

## Documentation impact

### Decision Records

None; the state folder is a `tools-ki`-owned machine-local layout.

### Specifications

None. The harness's `ki-delegation` standard already says the report is written to the state folder and copied into the work folder; this record makes the launcher match it.

### Guides

`man/ki.1` (the `ki agent` section and FILES), `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md` (run packet and closing a run) and `CHANGELOG.md`.

### Roadmap

None.

## Discussion

Open questions for planning:

- Where the run report defaults to when a thread folder exists.
- Which brief copies count as duplicates: the brief, the draft and the composed prompt.
- The retention limit for `_archive/`.
- Whether the sweep is a separate verb or part of `close`.

ki-burndown-3 adopted and planned this on 18 October 2026, answering the four questions in Decision provisionally, for Kris to confirm.
