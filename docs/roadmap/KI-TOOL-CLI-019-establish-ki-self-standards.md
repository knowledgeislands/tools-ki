---
id: KI-TOOL-CLI-019
title: Establish KI self
theme: cli
horizon: future
status: draft
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Give this repository a `ki-self` skill that owns its repository-specific operating standards, so contributors can distinguish them from portable CLI conventions held by `ki-tools`.

## Context

`tools-ki` has accumulated local expectations through its CLI contract, output conventions, release surfaces, and runtime-host responsibilities. Some may generalise to every Knowledge Islands tools repository and belong in `ki-tools`; others apply only to this CLI and need a clear local home. Without that boundary, repository-specific standards are either absent from durable guidance or risk being promoted into a general skill prematurely.

## Boundary

This item does not promote local rules into `ki-tools`, alter the public CLI contract, or independently define the portable lifecycle of a repository-local skill. It establishes the local source and asks the harness to formalise the reusable contract deliberately.

## Discussion

### Ownership boundary

Inventory the standards currently expected by this repository, classify each as portable or repository-specific, and record the latter in `ki-self`. Keep `ki-tools` focused on standards that are demonstrably useful across compatible CLI repositories. Treat an existing local convention as evidence to evaluate, not automatic justification for a new general rule.

The initial local source now covers the typed bootstrap-skill inventory, the distinction between bootstrap members, configured identities, resolved sources, and runtime projections, and repair coverage for configured skills. Its committed [rubric](../../.agents/skills/ki-self/references/rubric.md) makes these product requirements reviewable rather than leaving them as incidental implementation knowledge.

### First application

Review the output conventions introduced for framed list and inspection commands alongside the remaining CLI presentation surfaces. Decide which parts are portable `ki-tools` guidance and which are specific to `tools-ki`, then extend the local rubric only where a stable evidence surface exists.

### Portable lifecycle

The harness already treats a committed `.agents/skills/ki-self/` source as repository-authored governance and runtime projections as derived links. [TRD-af376594](../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md) asks it to formalise the remaining portable shape: discovery, activation, native audit/conform execution, and generated rubric publication. Until that work is accepted, this source is intentionally not declared as an installed harness capability.
