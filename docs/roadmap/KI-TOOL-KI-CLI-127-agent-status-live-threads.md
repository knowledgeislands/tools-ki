---
id: KI-TOOL-KI-CLI-127
area: CLI
title: Agent thread coordination commands
project: ways-of-working
component: agent
purpose: capability
kind: deliver
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 5f1349e59cc72fc8afc946d789565ab2a1dba8c2
created_at: 2026-10-14T13:55:48Z
updated_at: 2026-10-16T01:55:11Z
---

# Agent Thread Coordination Commands

## Goal

`ki agent` and `ki` gain the six small pieces the thread model adopted in `ki-agentic-harness` on 2026-10-14 asks of the launcher, so a coordinating thread can see what is live, classify each decision as it logs it, speak to another live thread, stay silent in a launched Codex agent, link a record in one call, and take an owner's bare option letter as an answer:

1. `ki agent status` with no run name lists the live threads on this machine.
2. `ki agent decide` carries each entry's decision class beside its `home:`, as the `ki-pmo` standard's decision classes require.
3. `ki agent send` delivers a line from one thread, or from the state-of-play thread, to another live coordination thread.
4. `KI_AGENT_RUN` is set by the Codex launcher as it is by the Claude launcher, so the coordinator reminder hook stays silent in launched Codex agents.
5. A link printer: a `ki` command that takes a roadmap record identifier and prints the ready Markdown link to its local file, resolving the repository from the identifier's scope through the registry, and for a pruned record the link `[<FULL-ID> (pruned)](https://github.com/<owner>/<repo>/blob/<last revision>/<path>)`.
6. Bare-letter resolution on `ki agent decide`: when the decision text after a Needs tag is a bare option letter, such as `b`, the command resolves the letter against the lettered options of the query carrying that tag in the latest report under the thread folder, and logs both the letter and the option's full wording.

Item 5 is delivered first; the other groups of Steps follow in any order.

## Context

Kris asked for the first item on 2026-10-14 in the `ways-of-working` thread, approving among a batch of recommendations "the surfaces rule and the ki agent status follow-on". It serves the re-anchoring rule that landed the same day, which has a thread that has just compacted re-read its standards and its checkpoint and then run `ki agent status` before confirming where it stands. Today the command needs a run name, so a thread that has lost its context cannot ask what is running.

The harness record [KI-HARNESS-GOV-187](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-187-thread-model-and-banner.md), which made the thread model normative, put every `tools-ki` change out of its own scope and listed four handoffs in its outstanding concerns: "`ki agent status` listing threads beside runs; the `home:` convention on `ki agent decide` so the log carries each entry's class; `ki agent send` to replace the `--log` inbox idiom; `KI_AGENT_RUN` on the Codex launcher so the hook can drop the terminal check there." Kris widened this record to carry them on 2026-10-14 with "KI-HANDOFFS - widen KI-TOOL-KI-CLI-127 to carry all four plus the link printer".

The link printer comes from the same day's linking lesson. Kris said, as received, "Getting a bit frustrated here again because now we're also losing the linking again for roadmap items in the summary output text", and settled the response with "LINK-GUARD - approve: hook line plus KI-HARNESS-GOV-188 in the harness, link printer in KI-TOOL-KI-CLI-127, output style handed to Rig: chezmoi". The harness side is [KI-HARNESS-GOV-188](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-188-report-record-links.md), a `ki-pmo` rubric check that every identifier an owner report cites is a link. The printer is the `tools-ki` side: the `ki-pmo` standard limits a coordinator turn to five tool calls, so a link must cost one call, not a registry lookup, a directory listing and a path assembly.

`ki agent send` is the route Kris named for re-bootstrap openers: "REBOOT-ALL - after GOV-187 is accepted and reply-stack lands, this thread re-bootstraps first, then the Master sends each live coordination thread its one-line re-bootstrap opener". Today a thread reaches another only by writing to a file the other thread polls, the `--log` inbox idiom the harness record asks to replace.

Bare-letter resolution comes from the lettered options the owner report gained on 2026-10-14 under the `ki-delegation` Reporting rule: each query lists `a) (recommended) …` and `b) …`, the reply block carries option a)'s instruction in full, and "whoever reads the reply accepts a bare letter as an answer and resolves it against the query's lettered options". Kris asked for the launcher side on 2026-10-14, as received: "LETTER-REPLY / add bare-letter resolution in ki agent decide to KI-TOOL-KI-CLI-127 as a sixth item, record only; expand letters by hand until then". Until it ships, the coordinating thread expands a letter to the option's wording by hand before logging it.

The retired state-of-play report that proposed the re-anchoring subsection is in the harness's run folder and is not a durable source.

## Boundary

- In scope: `ki agent status` without a run argument and its listing; a decision class on `ki agent decide` and `ki agent reconcile`, and what the `ki agent close` gate makes of it; `ki agent send`, its delivery file and how the receiving thread sees a line; verification that the Codex launcher sets `KI_AGENT_RUN`; the link printer command, its registry resolution and its pruned-record fallback; bare-letter resolution on `ki agent decide`, where it finds the options and what it logs; tests through `run(args, context)` and `sandbox()`; `README.md`, `man/ki.1`, the background-agents guide and the `CHANGELOG.md` command surface.
- Out of scope: any change to the per-run `status` output, `watch` or `wait`; inspecting agent logs or reports; archived runs under `_archive/`; the `coordinator-reminder` hook, the `ki-pmo` and `ki-delegation` standards and the `ki-pmo` rubric, which the harness owns; a notification surface beyond a file the receiving thread reads; any network or Git push; consolidating decisions into their homes, which stays the coordinating thread's duty.

## Requirements

- The live listing names each live run, its thread home when recorded, and each live agent with its state and latest status line, in a shape the `ki-pmo` banner can quote as `- [running] <agent> - <what>` items. A run whose folder predates `thread.json` is listed with no home rather than skipped. The command reads only packet files and changes nothing.
- A decision entry can carry one of the four classes `ki-pmo` defines, operational, rule, standalone or held, beside its `home:`, and `reconcile` can set or change the class of an existing entry. The `close` gate reads the class: an operational entry with no home is its own home and passes; a held entry whose home is the thread's checkpoint passes when that checkpoint exists, even where the repository's ignore block keeps `+/_CHECKPOINTS/` out of Git; a standalone entry still needs a Decision Record or the owner's `--reconciled` waiver. An entry with no class is treated as it is today.
- `ki agent send <run> <line>` appends one timestamped line, naming the sending run, to the receiving run's `inbox.md` in its state folder, and refuses when the receiving run is not live. The receiving thread sees new lines through `ki agent status` on its run.
- Every agent the Codex launcher starts, through `launch` and `dispatch`, carries the run name in `KI_AGENT_RUN`, and a test asserts it for both runtimes.
- The link printer prints `[<identifier>](<absolute path>)` for a record found under `docs/roadmap/` or `Streams/Roadmap/` in the repository the registry resolves from the identifier's scope. For a pruned record it prints `[<FULL-ID> (pruned)](https://github.com/<owner>/<repo>/blob/<last revision>/<path>)`, where the last revision is the last commit in which the file existed, usually the parent of the prune commit, and the owner and repository come from the verified canonical remote; the link text is always the full identifier followed by `(pruned)`. Kris set this form on 2026-10-14, as received: "LINK-FORM / clickable GitHub link to the file at its last revision; KI-HARNESS-GOV-188's check accepts it. Perhaps the link text can be `KI-HARNESS-GOV-188 (pruned)`". When the identifier resolves to nothing it prints why and exits non-zero, so a link is never invented. Several identifiers print one link per line.
- When `ki agent decide <run> '<TAG> - <letter>'` receives a decision whose text after the tag is a single option letter, it resolves the letter to that option's full wording and writes an entry carrying both, the letter and the wording, so the log reads without the report. It finds the wording in the latest report under the run's thread folder that carries a query under that tag, by file modification time, reading the `<letter>)` line of that query's **Options**. If no report under the thread folder carries the tag, the latest report carrying it has no option with that letter, or the decision has no tag, the command refuses, changes nothing and says which of those it was. A decision whose text is more than a letter is logged as it is today.

## Current state

`src/commands/agent/index.ts` registers `status <run>` and calls `runStatus` in `src/core/agent/runs.ts`, which summarises one run from its `.pid`, `.status` and `queue.jsonl` files. `agents()` already lists a run's agents from its pid files, and `readThread` in `src/core/agent/thread.ts` reads the home. Nothing enumerates the runs under `$KI_STATE_HOME/agents/`.

[KI-TOOL-KI-CLI-124 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/9c4c0c0ef55feac893e869b886e87639ece9d791/docs/roadmap/KI-TOOL-KI-CLI-124-agent-run-close.md), accepted and released in 0.10.3, gave `decide` a `--home <path or identifier>` option, added `ki agent reconcile <run> <number> <home>`, and made the `close` gate check that every entry's home exists and is Git-tracked or names a roadmap record found through the registry. The entry shape in `src/core/agent/thread.ts` is a heading, an optional `home:` line and the text; there is no field for a class, and the gate has no notion of an entry being its own home or of a checkpoint home that Git does not track, which that record's Discussion already flagged.

`src/core/agent/runtimes.ts` sets `KI_AGENT_RUN` in the environment of both adapters, Claude and Codex, since `feat(agent): mark every launched agent with KI_AGENT_RUN`, released in 0.10.2, and `src/tests/cli/agent.test.ts` asserts the marker for a Codex launch. The harness hook still keeps its terminal check for Codex, with the comment that it does so "until its launcher sets `KI_AGENT_RUN`"; the launcher already does.

Nothing in `ki agent` sends anything to another run. The `close` gate in `src/core/agent/close.ts` already walks the local registry for a record identifier, so the link printer's resolution can share that lookup; nothing yet maps an identifier's scope to one repository or finds a pruned record's last revision.

`decide` logs its text as given: `runDecide` in `src/core/agent/thread.ts` appends the heading and text with no reading of the thread folder's reports, so a bare letter would be logged as a bare letter, and the entry would mean nothing once the report it answers is superseded.

Re-read at `22584053` on 16 October 2026: the above still holds. `ki agent status` still requires a run, there is no `send`, `link` or `--class`, and `runDecide` still logs text as given. KI-TOOL-KI-CLI-124 has since been pruned (`43da3804`), so this record links it in the pruned form. Two facts moved. First, the `ki-pmo` banner now writes running agents as `- [running] <agent> - <what>` items. Second, the thread folder has a closed list, `decisions.md` and `<name>.report.md` only (THREADS-CONTENT, 15 October 2026), so the inbox moves to the state folder, where the `ki-delegation` standard already puts it.

## Decision

1. **Listing form.** Plain lines in the banner's `- [running] <agent> - <what>` and `- [queued] <agent> - <what>` form under a `<run> (<thread home>)` line, not a table, so a coordinator can quote them as they are.
2. **`--all`.** `ki agent status --all` also lists unarchived runs with nothing live, marked `- [at rest]`, for the sweep of old run folders. `_archive` is never listed.
3. **Printer scope.** The first delivery takes roadmap record identifiers only; checkpoint, Project and Initiative identifiers are a later extension.
4. **Command name.** A top-level `ki link <identifier>...`, as the first Step recommends.

These settle the open questions below.

## Steps

- [x] **Link printer.** Choose the command's name and place in `src/commands/` under `ki-self`: a top-level `ki link <identifier>...` is the recommendation, since it serves roadmap, checkpoint and thread work alike, with the identifier grammar imported from the work core rather than restated.
- [x] **Link printer.** Resolve the repository from the identifier's scope through the local registry: the `repo_code` and, where declared, the area code each registered repository's `.ki.toml` issues, so `KI-TOOL-KI-CLI-127` reaches `tools-ki` without a directory walk across every repository. Fall back to the walk `close` already does when no scope matches.
- [x] **Link printer.** Find the record file under `docs/roadmap/` or `Streams/Roadmap/` and print `[<identifier>](<absolute path>)`.
- [x] **Link printer.** For an identifier with no file but a number at or below the `_ISSUES.md` high-water mark, find its last committed revision with `git log --diff-filter=D` on the roadmap directory, take the parent of the deleting commit, and print `[<FULL-ID> (pruned)](https://github.com/<owner>/<repo>/blob/<last revision>/<path>)` with the owner and repository taken from the canonical remote.
- [x] **Link printer.** When nothing resolves, print the reason to stderr and exit non-zero.
- [x] **Link printer.** Tests through `run(args, context)` and `sandbox()` with a registry of two temporary repositories: a live record, a pruned record, an unknown scope and a bad identifier.
- [x] **Link printer.** Document the command in `README.md`, `man/ki.1` and the `CHANGELOG.md` command surface, and name it in the background-agents guide beside the owner report's linking rule.
- [x] **`ki agent status` lists live threads.** Make the run argument optional; without it, enumerate the run folders under `agents/`, skipping `_archive`, and summarise each through the existing per-run reader.
- [x] **`ki agent status` lists live threads.** Define live as at least one agent running or held, or a non-empty queue, and list only live runs by default; `--all` adds the rest per Decision 2.
- [x] **`ki agent status` lists live threads.** Print one block per run: the run name and thread home, then one line per agent as the per-run `status` prints it.
- [x] **`ki agent status` lists live threads.** Tests for a mix of live, finished and legacy runs.
- [x] **`ki agent status` lists live threads.** Document the form in `README.md`, `man/ki.1`, the background-agents guide and the `CHANGELOG.md` command surface.
- [ ] **Decision class on `decide`.** Add `--class <operational|rule|standalone|held>` to `decide`, written as a `class:` line beside `home:` in the entry, and a `--class` option on `reconcile` that sets or replaces it; an entry keeps working with neither.
- [ ] **Decision class on `decide`.** Teach the `close` gate the classes: operational with no home passes as its own home; held with a checkpoint home passes when the checkpoint file exists, tracked or not; standalone and rule keep the tracked-path or record test; `close.md` records each entry's class beside its home.
- [ ] **Decision class on `decide`.** Tests for each class through the gate, and for `reconcile --class`.
- [ ] **Decision class on `decide`.** Document `--class` and the gate's reading of it in the guide, `README.md`, `man/ki.1` and `CHANGELOG.md`.
- [ ] **`ki agent send`.** Add `ki agent send <run> <line>`: resolve the receiving run's thread home, refuse unless the run is live by the listing's definition, and append `<RFC 3339 UTC seconds> from <sending run>: <line>` to `inbox.md` in the receiving run's state folder, `$KI_STATE_HOME/agents/<run>/inbox.md`, where the `ki-delegation` standard already places a run's inbox; the thread folder's closed list (THREADS-CONTENT) admits only `decisions.md` and `<name>.report.md`. The sending run is `KI_AGENT_RUN` when set, else `--from <run>`, else the current directory's run.
- [ ] **`ki agent send`.** Make `ki agent status <run>` print the inbox lines added since the run's last `status` call, with the seen mark kept in the state folder, so a receiving thread's existing re-anchoring step shows what it was sent.
- [ ] **`ki agent send`.** Tests for a send to a live run, a refusal for a finished run, the sender taken from the marker, and the inbox shown once in `status`.
- [ ] **`ki agent send`.** Document `send` and the inbox in the guide, `README.md`, `man/ki.1` and `CHANGELOG.md`, and name the inbox file in the state folder's file list.
- [ ] **`KI_AGENT_RUN` on the Codex launcher.** Launch already asserts the marker for both runtimes (`src/tests/cli/agent.test.ts:103` and `:136`); add the missing assertion for a Codex agent started by `dispatch` from the queue, so a later adapter change cannot drop it on either path.
- [ ] **`KI_AGENT_RUN` on the Codex launcher.** Say in the guide that every launched agent, Claude or Codex, carries the marker, so the harness can drop the Codex terminal check in its hook.
- [ ] **Bare-letter resolution.** In `decide`, detect a decision whose text after `<TAG> -` is one letter `a` to `z`, optionally followed by `)`; anything longer is logged as today.
- [ ] **Bare-letter resolution.** Resolve the run's thread folder through `readThread`, list its `*.report.md` files newest first by modification time, and take the first whose `## Queries` section has a heading beginning with the tag; parse that query's **Options** lines, `<letter>)` with or without `(recommended)`, into letter and wording.
- [ ] **Bare-letter resolution.** Write the entry's text as `<letter>) <wording>`, with the wording's `(recommended)` marker stripped, and a `source:` line naming the report file, beside `home:` and `class:`.
- [ ] **Bare-letter resolution.** Refuse with a one-line reason and a non-zero exit when the decision carries no tag, no report under the thread folder carries the tag, or the latest such report has no option with that letter; write nothing in any of those cases.
- [ ] **Bare-letter resolution.** Tests through `run(args, context)` and `sandbox()` with a thread folder holding two reports carrying the same tag: a letter resolved from the newer report, a letter the newer report lacks, a tag no report carries, a decision with no tag, and a plain decision logged unchanged.
- [ ] **Bare-letter resolution.** Document the letter form in the background-agents guide beside the reply block, `README.md`, `man/ki.1` and `CHANGELOG.md`.

## Files touched

- `src/commands/agent/index.ts`
- `src/commands/` (the link printer's command module)
- `src/core/agent/runs.ts`
- `src/core/agent/thread.ts`
- `src/core/agent/close.ts`
- `src/core/agent/runtimes.ts`
- `src/core/work/` (identifier scope resolution shared with the printer)
- `src/tests/cli/agent.test.ts` and a test file for the printer
- `README.md`
- `man/ki.1` and `man/ki.commands.json`
- `docs/guides/user/background-agents.md`
- `CHANGELOG.md`

## Verify

### Link printer

- `bun run test:coverage` passes with the printer's cases.
- From any directory on this machine, the command given `KI-TOOL-KI-CLI-127` prints the link to this file by absolute path, and given this repository's most recently pruned identifier prints `[<FULL-ID> (pruned)](https://github.com/knowledgeislands/tools-ki/blob/<last revision>/docs/roadmap/<file>)`; given `KI-NOWHERE-XYZ-1` it exits non-zero with a reason.

### `ki agent status`

- `bun run test:coverage` passes with the listing's cases.
- `ki agent status` on this machine lists the running coordination threads with their thread homes and nothing archived.

### Decision class

- `bun run test:coverage` passes with the gate cases.
- In a temporary repository, `decide` with `--class operational` and no home passes `close`; `--class held --home +/_CHECKPOINTS/x.md` passes once the file exists; `--class standalone` with no home is a blocker.

### `ki agent send`

- `bun run test:coverage` passes with the send cases.
- From a shell, `ki agent send ways-of-working "probe"` against a live run appends one line to that run's `inbox.md` in its state folder, and the next `ki agent status ways-of-working` shows it once; the same against an archived run is refused.

### `KI_AGENT_RUN` on Codex

- The launch marker tests and the new dispatch marker test pass.
- `ki agent launch` of a trivial task with `--runtime codex` on this machine records `KI_AGENT_RUN` in the agent's environment, shown by a prompt that prints it.

### Bare-letter resolution

- `bun run test:coverage` passes with the letter cases.
- Against a live run whose latest report carries a query `PROBE` with options a) and b), `ki agent decide <run> 'PROBE - b'` appends an entry whose text is `b) <option b's wording>` and names the report in `source:`; `ki agent decide <run> 'PROBE - c'` is refused naming the missing letter and the log is unchanged; `ki agent decide <run> 'NOWHERE - b'` is refused naming the missing tag.

## Dependencies / blocks

- Follows [KI-TOOL-KI-CLI-124 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/9c4c0c0ef55feac893e869b886e87639ece9d791/docs/roadmap/KI-TOOL-KI-CLI-124-agent-run-close.md), accepted, which fixed the thread home the listing reads and the `home:` line the class sits beside.
- The thread model and the four handoffs are in [KI-HARNESS-GOV-187](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-187-thread-model-and-banner.md), accepted; the harness's own linking check is [KI-HARNESS-GOV-188](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-188-report-record-links.md), which the printer makes cheap to satisfy but does not depend on.
- Once `send` and the Codex marker test ship, the harness can retire the `--log` inbox idiom in `ki-delegation` and the Codex terminal check in `coordinator-reminder.sh`; those are harness changes and are not made here.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

The background-agents guide gains the no-argument `status` form, `--class` and the gate's reading of it, `send` and the inbox, the statement that both runtimes carry the marker, and a line naming the link printer beside the owner-report linking rule.

### Roadmap

No follow-on record. Harness follow-ons are named under Dependencies / blocks for the harness to capture when it chooses.

## Discussion

### The `home:` gap

The `ki-pmo` standard asks that each log entry be classified at the mark "under Decision classes: operational, rule, standalone or held, each with its home named in the log", and the harness handoff reads "the `home:` convention on `ki agent decide` so the log carries each entry's class". KI-TOOL-KI-CLI-124 delivered `decide --home` and `reconcile` for the home alone. The gap carried here is the class itself and what the gate makes of it: an operational entry whose home is "the log entry itself" and a held entry whose home is the checkpoint both fail today's gate, which is why KI-TOOL-KI-CLI-124 closed with sixty blockers against this thread and flagged the checkpoint case. There is a gap, and it is this.

### The Codex marker

The launcher already sets `KI_AGENT_RUN` for Codex, so the fourth handoff is nearly closed on the `tools-ki` side: what remains is the two-runtime test that pins it and the guide sentence the harness can cite when it drops its Codex terminal check. The hook change itself is the harness's.

### Bare letters

The Reporting rule puts the burden of a bare letter on "whoever reads the reply". Today that is the coordinating thread, which reads the report, finds the option and writes the wording into `decide` by hand, as Kris's instruction keeps it: "expand letters by hand until then". Resolution in the launcher makes the log carry the wording without a second reading and refuses a letter it cannot place, so a reply to a superseded report is caught at the mark rather than found at `close`. The latest report carrying the tag is the one resolved, since a tag is stable across reports and the newest report carries the options the owner saw last.

### Open questions

- Whether the live listing should also show runs with nothing live behind a flag, for the sweep of old run folders.
- Whether the output should be plain lines or a table; plain lines match the banner's `running:` prefix rule.
- The link form for a pruned record is settled: Kris decided on 2026-10-14, as received, "LINK-FORM / clickable GitHub link to the file at its last revision; KI-HARNESS-GOV-188's check accepts it. Perhaps the link text can be `KI-HARNESS-GOV-188 (pruned)`". The printer prints `[<FULL-ID> (pruned)](https://github.com/<owner>/<repo>/blob/<last revision>/<path>)` and the harness check under [KI-HARNESS-GOV-188](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-188-report-record-links.md) accepts that form; the `git show` locator and the materialised copy are dropped.
- Whether the printer should also take checkpoint, Project and Initiative identifiers, which the `ki-pmo` rule links the same way; the first delivery takes roadmap records only.

Planned to Ready on 16 October 2026 in the tools-burndown thread, which Kris's OWNER-LANE decision made this record's writer lane; the record stays in the ways-of-working Project. The Decision settles the open questions above, the inbox moves to the state folder under the thread folder's closed list, and the KI-TOOL-KI-CLI-124 links take the pruned form.
