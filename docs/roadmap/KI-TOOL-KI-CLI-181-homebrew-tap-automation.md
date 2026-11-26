---
id: KI-TOOL-KI-CLI-181
area: CLI
title: Homebrew tap automation
priority: medium
size: s
status: triage
assignee: work/ki.tools
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-14T19:09:45Z
updated_at: 2026-11-26T02:47:03Z
---

# Homebrew tap automation

## Goal

A published `ki` release reaches the Knowledge Islands Homebrew tap (`knowledgeislands/homebrew-tap`) without anyone touching it: the tap proposes the formula update, its CI checks the proposal, and the pull request merges once the checks pass. The same release reaches every repository's CI pin (`.github/ki-version`) the same way: each receiver proposes its pin update when a release is published, without a manual dispatch.

## Context

Kris approved this item on 14 November 2026 (TAP-FIX a). The tap's automation has not run since 26 October 2026: its last scheduled "Propose tool releases" run was on that day, and the formulas for 0.16.0 and 0.16.1 were advanced by hand on 14 November (tap commits `d48cfaa` and `639039c`).

The likely cause is the tap's own commit `fe65adc` on 27 October 2026, "run CI and release workflows on manual dispatch only". It removed:

- the `repository_dispatch` (`tool-release-published`) and daily `schedule` triggers from `propose-tool-releases.yml`, so the dispatch that tools-ki's `release.yml` sends in its `notify-homebrew-tap` job now arrives at a workflow that does not listen for it;
- the `push` and `pull_request` triggers from `ci.yml`, so a formula proposal opened with auto-merge would wait for required checks that never start.

`update-ki-pin.yml` is also manual-dispatch only, although its comment still describes a daily backstop. The release App's variable and secret are still set in the tap, and tools-ki's last three releases ran successfully, so the sending side looks intact. Why the triggers were removed is not recorded in the commit; it may have been to save Actions minutes or to stop noise, and planning should ask before restoring them.

### The CI pin receivers

Widened on 26 November 2026 from the ki.tools reset map ([4.1](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#41-kisoptools-legacy-10), PIN and CI-PIN-RECEIVER). Kris agreed the CI pin receiver on 25 October 2026, and ki.sop.main asked for it to be rolled out to every `knowledgeislands` repository on 28 October ([legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L46)). The pin is in place: 21 local checkouts carry `.github/ki-version` and `update-ki-pin.yml` (checked 26 November 2026). Every one of those receivers triggers on `workflow_dispatch` only, the same fault as the tap's above, so a release moves no pin until someone dispatches each by hand. PIN, from the same legacy ([legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L38)), also asked for tools-ki's CI guide in `docs/guides/developer/` to say that tools-ki's CI builds `ki` from its own source instead of taking the pin; planning checks whether that guide now says so.

## Boundary

Capture only. In scope when planned: the tap's workflow triggers, the dispatch hand-off from tools-ki's release workflow, and a check that a release reaches a merged formula; the same for the CI pin receivers, which the template in `ki repo conform` renders and each repository then takes; and the CI guide line PIN asked for. Out of scope: the formulas' content, the release workflow's build, and the tap's branch rules beyond what auto-merge needs.

## Dependencies / blocks

None. Planning follows `ki-repo-tools` for release and distribution.

## Discussion

### Restoring the triggers

The likely repair restores `repository_dispatch` and a daily `schedule` on `propose-tool-releases.yml`, and `pull_request` (with `push` to `main`) on `ci.yml`, then proves the path end to end with the next release. If the triggers were removed on purpose, the alternative is to keep them manual and have tools-ki's release dispatch both workflows with `workflow_dispatch`, which needs the release App to hold `actions: write` on the tap.
