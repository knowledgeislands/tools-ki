---
id: KI-TOOL-KI-CLI-148
area: CLI
title: Coordination rename, CLI side
project: ways-of-working
purpose: corrective
kind: deliver
component: agent
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 53bee079fb949fb19f604bf923517c6d7f3303d4
created_at: 2026-10-18T09:17:41Z
updated_at: 2026-10-18T10:31:30Z
---

# Coordination Rename, CLI Side

## Goal

`ki` follows the harness renames of [KI-HARNESS-GOV-217](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-217-coordination-and-work-design-renames.md), `ki-pmo` to `ki-coordination`, `ki-pmo-design` to `ki-work-design` and `ki-checkpoint` to `ki-work-folder`, with no alias; and the `ki agent` help text speaks the work model rather than the thread model.

## Context

Kris Brown answered the skills-audit batch on 18 October 2026, recorded in the ways-of-working decisions log under "owner answers, skills-audit batch":

- PMO-NAME: "Let's get rid of PMO and go with KI coordination. There's no need to accept it as an alias."
- DESIGN-NAME: "KI work design is good".
- WORKER-CLI: "KI agent makes a lot of sense ... It doesn't have to be just robots": keep `ki agent`, and correct the thread-model words in the `decide` and `home` help text.
- VISIBLE-PUSH: one tools-ki record for the CLI side.

Kris reopened the work-folder skill at 10:15 the same day and answered it later under "owner answers, Summary queries; mark", read back as WORK-FOLDER-NAME a): "`ki-work-folder` ("work forward" in speech)." The `work-folder-rename` run folded the CLI side of that rename into this record. Old checkpoints' `type: ki-checkpoint` is data, read by `ki work status` for the tolerance window, and stays.

## Boundary

- In: the canonical bootstrap skill list and its test fixtures; every `ki-pmo` and `ki-pmo-design` mention in source comments, help text, the manual, `man/ki.commands.json`, the user guide and the specification; the `ki agent` help text that names a thread, a thread home or a thread's log; every `ki-checkpoint` skill mention in the manual, `man/ki.commands.json` and the specification.
- Out: old checkpoints' `type: ki-checkpoint` value; the `## Decision <n>` numbering that `decide` writes and `reconcile` reads, which [KI-TOOL-KI-CLI-150](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) carries; the canonical harness pin, which moves to a pushed harness commit with its archive digest at the next release's preparation; a release; history in `CHANGELOG.md` and closed records.

## Current state

`minimumBootstrapUserSkills` names `ki-pmo-design`, so `ki` refuses a canonical harness that carries `ki-work-design` instead, and the installed harness on this Mac, a link to the harness checkout, now does. `ki agent home` prints "the run's thread home", `decide` appends to "the thread's tracked decisions log" and `--class` names "the decision's ki-pmo class".

## Steps

- [x] `src/core/harness/bootstrap-capabilities.ts` and the test helper and fixtures name `ki-work-design`.
- [x] Source comments name `ki-coordination`.
- [x] `ki agent` help text: `home` prints the run's work folder, `decide`, `reconcile`, `status` and `--log` name the work's decisions log, and `--class` names the `ki-coordination` decision class.
- [x] The manual, `man/ki.commands.json`, the background-agents guide and `CHANGELOG.md` follow.
- [x] The manual, `man/ki.commands.json` and the specification name `ki-work-folder` and its work-folder standard, and describe old checkpoints without the skill name.
- [x] Run Verify.

## Files touched

- `src/core/harness/bootstrap-capabilities.ts`, `src/commands/agent/index.ts`, `src/core/agent/runs.ts`, `src/core/agent/thread.ts`, `src/core/work/status.ts`
- `src/tests/cli/_cli_helper.ts`, `src/tests/cli/bootstrap/bootstrap.test.ts`, `src/tests/cli/dev/dev.test.ts`, `src/tests/cli/manage/diag.test.ts`, `src/tests/cli/manage/local-commands.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md`, `docs/specs/repository-operations.md`, `CHANGELOG.md`
- this record and `docs/roadmap/_ISSUES.md`

## Verify

- `bun run test`, `bunx tsc --noEmit`, `bunx knip` and `mandoc -T lint man/ki.1` pass.
- `ki agent home --help` and `ki agent decide --help` carry no thread-model words.
- `ki repo audit --repo .` reports no new failure.
- No live `ki-pmo` or `ki-checkpoint` skill mention remains outside history.

## Dependencies / blocks

Lands beside [KI-HARNESS-GOV-217](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-217-coordination-and-work-design-renames.md). The canonical harness pin still names `4cae8271`, which carries `ki-pmo-design`, so a fresh bootstrap from this source refuses that harness until the pin moves to a harness commit carrying `ki-work-design`; that repin needs the pushed commit's archive digest and belongs to the next release's preparation, which asks Kris first.

## Documentation impact

### Decision Records

None: the names are Kris Brown's answers.

### Specifications

`docs/specs/repository-operations.md` describes old checkpoints by their `type` value rather than the skill name.

### Guides

`docs/guides/user/background-agents.md` names the work folder and `ki-coordination`.

### Roadmap

None.

## Review

### Delivered

`ki` requires `ki-work-design` among the canonical Harness's bootstrap user skills, so it accepts the renamed Harness; source comments, the manual and the background-agents guide name `ki-coordination`; and the `ki agent` `home`, `decide`, `reconcile`, `status`, `send --from`, `--repo`, `--log` and `--class` help text names the run's work folder and the work's decisions log. The manual, command inventory and specification name `ki-work-folder` in place of `ki-checkpoint`.

### Change Summary

- `src/core/harness/bootstrap-capabilities.ts`: `minimumBootstrapUserSkills` names `ki-work-design`.
- `src/commands/agent/index.ts`: help text in work-model words; `src/core/agent/runs.ts`, `thread.ts` and `src/core/work/status.ts`: comments name `ki-coordination`.
- Test helper and fixtures: `ki-work-design` sorts after `ki-recap` in the expected `.ki.toml`, search and diagnosis output.
- `man/ki.1` and the regenerated `man/ki.commands.json`; `docs/guides/user/background-agents.md`; one `CHANGELOG.md` line.
- Work-folder rename: `man/ki.1`'s Work model section and the regenerated `man/ki.commands.json` name `ki-work-folder` and its work-folder standard; `docs/specs/repository-operations.md` names old checkpoints by their `type`; one `CHANGELOG.md` line.

### Verification

On 18 October 2026: `bun run test` passed 1334 tests; `bunx tsc --noEmit`, `bunx knip` and `mandoc -T lint man/ki.1` passed; `ki agent home --help` and `ki agent decide --help` carry no thread-model word; no `ki-pmo` remains in `src`, `man` or the guides. `ki repo audit --repo .` reports FAIL=1, the BIO-1 Biome gate, from findings in files this record does not touch and a `biome.json` schema that names 2.5.12 beside the installed 2.5.15; the touched files pass `biome check`. For the work-folder rename the same day: `bun run test` passed 1346 tests, with another session's uncommitted configuration changes in the checkout; `bunx tsc --noEmit` and `mandoc -T lint man/ki.1` passed and `man/ki.commands.json` is in sync; `ki repo audit --repo .` reports no failure in `ki-work-roadmap` or `ki-engineering` run alone, its whole-repository TEST-5 failure being a coverage-directory lock held by a concurrent Vitest run.

### Outstanding concerns

- Resolved 18 October 2026 under RELEASE-REPIN a): the canonical Harness pin moved from `4cae827` to the pushed Harness `main` `0828bd0`, which carries both the coordination and work-folder renames, with archive digest `0b2bf10b`; `bun run test:coverage` passed 1346 tests and the v0.11.2 release ships it.
- `ki agent` output strings still say "thread home" (`no thread home` and "Thread home of <run> is now"); they are behaviour asserted by tests rather than help text, and stay for a later change.
- `decide` still writes `## Decision <n>` headings, which the coordination standard's no-numbering rule does not use for the log; [KI-TOOL-KI-CLI-150](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) carries the change with the close gate's parse.

### Post-change review

None beyond the outstanding concerns.

### Mini recap

`ki` now accepts the renamed coordination, work-design and work-folder skills, and `ki agent` help speaks of work folders and the work's decisions log.

## Discussion

Captured by the `coordination-rename` run in the ways-of-working work on Kris Brown's answers of 18 October 2026, as the one tools-ki record VISIBLE-PUSH asks for.
