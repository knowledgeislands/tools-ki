---
id: KI-TOOL-KI-CLI-178
area: CLI
title: Sent pass and forward-match logging in mcp-m365
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

# Sent pass and forward-match logging in mcp-m365

## Goal

SENT-PASS: `mcp-m365`, the mail engine `ki` owns, gains a sent pass and forward-match logging, so the Sent Items routing that waits on it can follow: "Sent Items stays at zero by rule: sent mail is filed to the archive matching its conversation's folder, and sent meeting responses are removed at once."

## Context

Kris asked for this part to be held on tools-ki's roadmap under EMAIL-ENGINE a, 5 November 2026, relayed by personal.reg.assistant-terra as ATER-031 (21:22 GMT) in Principal `+/_WORK/ki.sop.main/messages.md`. It comes from krisb/assistant [PERSONAL-ASSISTANT-M365-001](/Users/krisbrown/kis/personal/assistant/docs/roadmap/PERSONAL-ASSISTANT-M365-001-acquire-microsoft-365-mail.md), which closes now that email capture is delivered. ATER-031's text for this part, quoted in full:

> (1) SENT-PASS, the sent pass and forward-match logging in `mcp-m365`, with the Sent Items routing that follows it. Goal: "Sent Items stays at zero by rule: sent mail is filed to the archive matching its conversation's folder, and sent meeting responses are removed at once." Context: Formerly PERSONAL-ASSISTANT-M365-002, and before that HNR-PRINCIPAL-KM-065. Kris, SENT-TRIAGE a, 28 October 2026, and SENT-RESPONSES as changed on 1 November 2026: "If the replies, they're done, right? They can just be deleted." Invitations and cancellations are left alone. The rule lines wait for the mail-engine owner (`ki`) to land the sent pass and forward-match logging (SENT-PASS). Until then hand passes keep Sent Zero; Sent Items reached 0 on 1 November 2026, so the second hand pass planned for about 3 November may no longer be needed. Kris kept Sent Items routing (about 23:22 GMT: "Keep") and the shadow review (about 23:24 GMT: "Keep") on 1 November 2026, as taken in the hnr.reg.email-routing decisions log. Shaping: Approach: once `ki` lands the sent pass and forward-match logging (SENT-PASS), add HNR rule lines through the routing queue that file sent mail to its conversation's archive and remove sent meeting responses at once; hand passes keep Sent Zero meanwhile. Dependencies: `ki`'s sent pass. Decisions still needed: whether the hand pass planned for about 3 November is still needed. Promotion: SENT-PASS lands in `ki`.

## Boundary

Capture only: nothing is adopted or planned. The engine change, the sent pass and forward-match logging, lands in `mcp-m365`. The HNR rule lines that follow it go through the routing queue, and no mailbox, rule or credential changes by capture.

## Dependencies / blocks

None within tools-ki. The Sent Items rule lines wait on this record.

## Discussion

### Open decision

Whether the hand pass planned for about 3 November is still needed.
