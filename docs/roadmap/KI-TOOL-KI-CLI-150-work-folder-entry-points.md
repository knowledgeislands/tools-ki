---
id: KI-TOOL-KI-CLI-150
area: CLI
title: Work folder entry points
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T10:26:00Z
updated_at: 2026-10-18T19:22:14Z
---

# KI-TOOL-KI-CLI-150: Work Folder Entry Points

## Goal

`ki` keeps the work folder to the entry points the `ki-work-folder` standard sets: the close gate reads the decisions log's timestamped headings, `ki agent decide` writes unnumbered timestamped entries that `reconcile` addresses by timestamp, `ki agent launch` refuses a brief that sends its report into the work folder, and `ki work message` and `ki work prune` write a Messages line and tidy a work folder under that standard's rules.

## Context

Kris Brown made `ki-work-folder` the canonical specification of the work folder on 18 October 2026, in the ways-of-working decisions log under "owner answers, Summary queries; mark", with "Yep, and the workflow checks we can go with", read back as:

- WORK-FOLDER-OWNER a): "the work-folder skill is the canonical specification; ki-coordination timing and judgement; ki-delegation run side only; ki-work-design graduation; others check in on the four-point contract."
- WORK-FOLDER-CHECKS a): "audit checks into KI-HARNESS-GOV-200; one new tools-ki record for the close-gate parse, unnumbered `decide`, launch refusal and `ki work message`/`prune`." The same answer settles DECIDE-NUMBERS a).

The harness wording landed under [KI-HARNESS-GOV-217](https://github.com/knowledgeislands/ki-agentic-harness/blob/87da1b262fcc60678a31850461dd63c4a848e592/docs/roadmap/KI-HARNESS-GOV-217-coordination-and-work-design-renames.md): the [work-folder standard](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-work-folder/references/standards-work-folder.md#the-work-folder) owns the closed list, entry points, tidy rules and Messages line shape; the `ki-coordination` decisions log section says entries are timestamped and carry no numbers; and the `ki-delegation` run packet says an agent writes its report to the run's state folder and nowhere else, the launcher homing it.

Today the code disagrees in four places:

- **Close gate:** `src/core/agent/thread.ts` parses only `## Decision <n>` headings (`heading` at line 296), so a log written in the current `## <YYYY-MM-DD HH:MM zone> - <title>` form shows no entries to the gate in `src/core/agent/close.ts`.
- **`decide` and `reconcile`:** `appendDecision` writes `## Decision <n> (<instant>)` and `reconcileDecision` addresses an entry by its number, against the no-numbering rule.
- **Launch:** `reportConflicts` in `src/core/agent/runs.ts` only warns on a report path inside the work folder, and the run skeleton fills `<report path>` with `${thread.folder}/${name}.report.md` (line 696), the work folder itself, where the run packet now names the state folder.
- **Messages and tidy:** no command writes a Messages line or tidies a work folder; coordinators do both by hand.
- **Retired homes (built):** a run whose `thread.json` recorded `+/_THREADS/<run>/` kept copying its reports there, because `newRunFolder` fell back to the thread folder and matched a work folder only by its full slug, so the `chezmoi` run never found `ki.chezmoi`. Kris named the result THREADS-REGRESSION on 18 October 2026, in the ways-of-working decisions log under "owner answers, recap batch", after `+/_THREADS/chezmoi/host-locals-sol.report.md` reappeared in Knowledge Islands Principal at 09:19 BST.

## Boundary

- In: the close gate reading timestamped headings, with numbered headings still read in logs written before the work model; `decide` writing unnumbered timestamped headings and `reconcile` addressing an entry by its timestamp; the run skeleton naming the state-folder report path and `launch` and `queue` refusing a brief whose report path is inside `+/_WORK/<id>/`; `ki work message <receiver id>` adding one Messages line in the standard's shape and committing that path alone under `docs(work): <receiver id> message from <sender id>`; `ki work prune <id>` listing, and on confirmation deleting by explicit path, the reports and briefs the tidy rules let go, never deciding whether an outcome is homed; the manual, `man/ki.commands.json`, help text, specification and tests that follow.
- In, built by the `threads-fix` run under THREADS-REGRESSION and released in `ki` v0.11.3: a run names its work folder by its slug or, for a run named before the slug, its id after the territory; a run that names none or two is refused, with no `+/_THREADS/<run>/` fallback; a recorded `+/_THREADS/` home is followed into that work folder and recorded there, and one with none stays readable but takes no launch, decision, reconcile, adopted state file or homed report; the run skeleton fills `+/_WORK/<id>` with the run's work folder; `ki agent status` and `ki agent home --work` say "work folder" for "thread home"; manual, changelog and tests follow.
- Out: the rubric checks, which [KI-HARNESS-GOV-200](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md) owns; the CLI side of the skill rename, which [KI-TOOL-KI-CLI-148](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-148-coordination-rename-cli-side.md) carries; old checkpoints' `type: ki-checkpoint` reading in `ki work status`; a release.

## Dependencies / blocks

The heading form the close gate parses must match the decision-heading check KI-HARNESS-GOV-200 adds, so the two settle one form between them. The launch refusal changes what every live coordinator's briefs may say, so it lands with the run-prompt wording in the harness and a release.

## Discussion

Captured by the `work-folder-rename` run in the ways-of-working work on Kris Brown's WORK-FOLDER-CHECKS answer, as its one new tools-ki record; adoption, priority and plan belong to this repository. Not built in that run: each part changes behaviour every live coordinator depends on, and the close-gate heading form waits on KI-HARNESS-GOV-200. The `threads-fix` run built the retired-home part on 18 October 2026, and `ki` v0.11.3 released it that evening; before then the installed `ki` kept copying reports into the `+/_THREADS/` home of every run group recorded there. The `ki-release` run left the launch part for a later release: this record is still in triage with its planning questions open, and the refusal would reject the live coordinators' common rules, which still send reports to `+/_WORK/<id>/<name>.report.md`, so it needs planning with the run-prompt wording. Questions for planning: whether `ki work prune` deletes only on an explicit list or also offers the candidates interactively; and whether the close gate keeps reading numbered headings after the tolerance window closes.
