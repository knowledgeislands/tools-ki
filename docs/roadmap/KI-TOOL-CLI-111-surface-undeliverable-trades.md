---
id: KI-TOOL-CLI-111
area: CLI
title: Surface undeliverable trades
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T23:27:45Z
updated_at: 2026-10-06T23:34:24Z
---

# Surface undeliverable trades

## Goal

An outbound trade submitted on a route whose receiver has not activated the matching import route is reported as undeliverable, warned about at submission, releasable by its sender, and explained at the receiver, so neither party can be stuck in a silent deadlock. A sender can also withdraw any submitted trade that the receiver has not yet received, through a supported command rather than by hand.

## Context

Source: work trade [TRD-d03495e9](https://github.com/knowledgeislands/ki-agentic-harness/blob/78e6551f91fe3afb29ca96c9a47ecd63bf9b02b7/-/_TRADES/knowledgeislands/tools-ki/TRD-d03495e9.md) ("Surface outbound trades on routes receiver never activated"), sent by `knowledgeislands/ki-agentic-harness` from its record `KI-HARNESS-GOV-090` on 2026-10-04 (harness commit `26d936eb0914a61b00f105dee134a1277fa57c09`), with observation policy `decision`. GOV-090 has since been accepted and pruned in the harness (`0b7bbcc4`), so no live harness record links here.

On 2026-10-07 Kris decided that this trade, still awaiting receipt, is to be removed and its content carried directly in this roadmap as Triage. The decision and the leftover-state review that prompted it are tracked in the `ki-arcadia-principal` checkpoint `+/_CHECKPOINTS/state-of-play.md` (last committed at `7a5f33c341f4e4179ffaee992a8d054f64e79291`). This record carries the trade's full content; it is captured, not adopted.

The trade's context, verbatim:

> A work trade submitted on an export route whose receiver declares no matching import route is reported as 'awaiting receipt' indefinitely. TRD-8b69fe1b (5g-emerge-phase2 to ki-agentic-harness, 2026-08-21) sat a month: the receiver's 'trade receive --all' reported zero eligible, the sender's 'trade release' refused with 'awaiting receiver', and the receiver's 'trade receive <id>' refused as 'unavailable or ambiguous'. Neither party could detect or escape the deadlock. 'routes check' already computes the route state 'awaiting-receiver' (src/core/trade/estate.ts), but tradeLifecycle (src/core/trade/lifecycle.ts) reports deliveryStatus 'awaiting-receipt' for every unreceived outbound record without consulting that state, and submission on a pending route is allowed (8533e1b).

At capture the gap remains: `src/core/trade/estate.ts` computes `awaiting-receiver`, while `src/core/trade/lifecycle.ts` and `src/commands/trade/records.ts` still report `deliveryStatus: 'awaiting-receipt'` without consulting it.

No existing record duplicates this. KI-TOOL-CLI-108 (roadmap list structural validity) and KI-TOOL-CLI-109 (rubric publication root) are unrelated.

## Boundary

In scope, from the trade's constraints: CLI detection and messaging. Added on 2026-10-07: a sender-side withdraw command for a submitted, unreceived trade (see Discussion).

Out of scope: route policy and the `ki-trades` standard, which the harness owns; widening any repository's routes. The receiver owns priority, plan and execution.

## Discussion

### Acceptance conditions from the trade

The trade's submission, verbatim:

> Make an undeliverable outbound trade visible and resolvable: (1) when the route to the receiver is not active, report the outbound record as undeliverable (naming the missing receiver import route) in 'trade list', 'trade show' and the sender's audit, rather than 'awaiting receipt'; (2) warn at 'trade submit' when the route is still awaiting receiver activation; (3) let the sender release or abandon an outbound submission whose route is not active, with an error message that names the missing receiver route rather than implying a receiver that never had one; (4) make the receiver's 'trade receive' refusal say when a visible outbound trade addressed to it has no matching local import route.

### Sender-side withdrawal

Added on 2026-10-07 at Kris's direction. Requirement: provide a sender-side withdraw facility for a submitted trade that the receiver has not yet received, for example `ki repo trade withdraw <trade-id>`. It must:

- remove the sender's outbound copy of the submitted trade;
- record the withdrawal evidence (trade ID, receiver, reason, time and actor) where the sender keeps it, so the withdrawal stays traceable after the outbound copy is gone;
- refuse once the receiver has received the trade, directing the sender to the existing observation-led `ki repo trade release` path instead.

Withdrawal applies whether or not the receiver's route is active, so it also answers part (3) of the trade's submission for inactive routes.

Motivating case: this trade and TRD-8004751b, both submitted to `knowledgeislands/tools-ki` and never received, had to be deleted by hand as an explicit one-off exception to the trade standard, because no supported withdrawal existed. The deletion is harness commit [`9cac045245a36326f02e8e3a9aa192e7749e4f85`](https://github.com/knowledgeislands/ki-agentic-harness/commit/9cac045245a36326f02e8e3a9aa192e7749e4f85) ("chore(trades): withdraw two unreceived tools-ki trades by hand"). TRD-8004751b's content is carried by KI-TOOL-CLI-110.

Harness handoff: the `ki-trades` standard (`skills/governance/ki-trades` in `knowledgeislands/ki-agentic-harness`) must define withdrawal as a sender operation on a submitted, unreceived trade, including its evidence and refusal rules. That change belongs to the harness and is not made here; it should reach the harness as its own handoff before or alongside delivery of this record.

### Open questions

- Should releasing an outbound submission on an inactive route be a distinct sender operation, or an exception to the existing observation-led `ki repo trade release` eligibility? The harness trade standard currently allows release only after the observation policy is satisfied. A general withdraw command for unreceived trades, as above, may make a separate inactive-route release unnecessary.
