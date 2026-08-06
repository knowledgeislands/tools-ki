---
id: TRD-e5ad514f
title: 'Model roadmap trade waits'
created_at: 2026-08-06T07:06:43Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: KI-TOOL-CLI-019
---

# TRD-e5ad514f: Model roadmap trade waits

## Context

A repository work item can genuinely wait for a cross-repository trade: for example, until the receiving repository has made an observed decision or completed its independent follow-on work. The current `blocked-by` field cannot express that relationship because it is reserved for local work-item identifiers, must be reverse-consistent, and forms an acyclic local dependency graph. A trade has a separate identity, authority boundary, and receiver-owned lifecycle.

## Submission

Extend the roadmap and trade contracts with an explicit cross-repository wait model. `ki-roadmap` should own an optional `waiting-on-trades: [TRD-…]` field and its relationship to the `waiting-for` horizon. `ki-trades` should own validation of the referenced trade identifier, route, delivery state, and observed receiver decision. A waiting roadmap item should state in its dependency narrative the exact trade outcome that unblocks local work—such as `adopted`, `retained`, `declined`, or `superseded`—rather than treating a trade as a local blocker or inferring completion.

## Constraints

Do not extend `blocks` or `blocked-by` to accept trade identifiers, and do not make a sender's local roadmap item authoritative over receiver priority or implementation. The receiver retains its independent decision and scheduling authority. The field must support more than one trade, tolerate a trade that is still pending, and preserve the existing local work-item dependency graph. The Harness retains all decisions on exact schema, user commands, rubric checks, and migration.
