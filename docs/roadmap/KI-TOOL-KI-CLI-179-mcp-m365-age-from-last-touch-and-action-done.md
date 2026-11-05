---
id: KI-TOOL-KI-CLI-179
area: CLI
title: Age from last touch and ACTION-DONE in mcp-m365
priority: medium
size: m
assignee: work/ki.sop.main
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-05T21:28:00Z
updated_at: 2026-11-05T21:28:00Z
---

# Age from last touch and ACTION-DONE in mcp-m365

## Goal

981-AGE: `mcp-m365`, the mail engine `ki` owns, measures age from last touch and lands ACTION-DONE, so the per-folder archive rules that wait on them can follow: "every triage folder has its own archive rule, saying when its mail moves to the folder's `_ARCHIVE` mirror: for example, received over 14 days ago, read and unflagged. Whether the mail system itself records when an email was read is looked into and used, without building a record of our own."

## Context

Kris asked for this part to be held on tools-ki's roadmap under EMAIL-ENGINE a, 5 November 2026, relayed by personal.reg.assistant-terra as ATER-031 (21:22 GMT) in Principal `+/_WORK/ki.sop.main/messages.md`. It comes from krisb/assistant [PERSONAL-ASSISTANT-M365-001](/Users/krisbrown/kis/personal/assistant/docs/roadmap/PERSONAL-ASSISTANT-M365-001-acquire-microsoft-365-mail.md), which closes now that email capture is delivered. ATER-031's text for this part, quoted in full:

> (2) 981-AGE, `mcp-m365` measuring age from last touch, and ACTION-DONE, with the per-folder archive rules that follow them. Goal: "every triage folder has its own archive rule, saying when its mail moves to the folder's `_ARCHIVE` mirror: for example, received over 14 days ago, read and unflagged. Whether the mail system itself records when an email was read is looked into and used, without building a record of our own." Context: Formerly PERSONAL-ASSISTANT-M365-004, and before that HNR-PRINCIPAL-KM-067. Held under ARCHIVE-ENGINE, AGE-CLOCK a and ACTION-DONE until the mail-engine owner (`ki`) makes `mcp-m365` measure age from last touch and lands ACTION-DONE. The 981-AGE engine ask went through personal.reg.assistant-terra to ki.prj.ways-of-working on 1 November 2026. Kris reshaped the archive rules the same evening, about 23:22 GMT: "for every triage folder, we should define rule it goes archive. So some will be something like, they've been received in 14 days and they've been marked read and not flagged … What I don't want to do is build state we don't need build. So ideally system should able tell you when it read … I want get this moved into personal." The earlier goal, a uniform 14-day archive aged from last touch with action-done filing, survives only as context. Folded into the archive rules on 1 November 2026: [HNR-PRINCIPAL-KM-061](/Users/krisbrown/kis/humans-not-robots/hnr-principal/Streams/Roadmap/HNR-PRINCIPAL-KM-061-settle-the-triage-to-archive-flows-design.md), whose draft [archive flows](https://github.com/krisb/hnr-principal/blob/b7ed903b6ee378bc72cb14fab7122ea6dfe5ded3/+/_WORK/hnr.reg.email-routing/design/archive-flows.md) design note is their starting point ("Fold into KM-067", about 23:26 GMT); and archive rules A3 to A5 from [HNR-PRINCIPAL-KM-068](/Users/krisbrown/kis/humans-not-robots/hnr-principal/Streams/Roadmap/HNR-PRINCIPAL-KM-068-graduate-the-held-routing-rules-by-phase.md) ("Cancel and fold in", about 23:32 GMT). Shaping: Approach: start from the draft archive flows design note, find whether the mail system records when an email was read, then write one archive rule for each triage folder with Kris. Dependencies: `mcp-m365` measuring age from last touch and ACTION-DONE, asked of `ki` as 981-AGE. Decisions still needed: each folder's rule. Promotion: the engine changes land in `ki`.

## Boundary

Capture only: nothing is adopted or planned. The engine changes, age from last touch and ACTION-DONE, land in `mcp-m365`. The per-folder archive rules that follow them are HNR routing notes and rule lines, written with Kris, and no mailbox, rule or credential changes by capture.

## Dependencies / blocks

None within tools-ki. The per-folder archive rules wait on this record.

## Discussion

### Open decisions

Each triage folder's archive rule, and whether the mail system records when an email was read, so that no record of our own is built.
