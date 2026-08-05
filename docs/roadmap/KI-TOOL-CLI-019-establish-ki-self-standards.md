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

This item does not define the `ki-self` content now, migrate general conventions out of `ki-tools`, or alter the public CLI contract. It establishes the ownership boundary and the work needed to capture this repository's specific standards deliberately.

## Discussion

### Ownership boundary

Inventory the standards currently expected by this repository, classify each as portable or repository-specific, and record the latter in `ki-self`. Keep `ki-tools` focused on standards that are demonstrably useful across compatible CLI repositories. Treat an existing local convention as evidence to evaluate, not automatic justification for a new general rule.

### First application

Review the output conventions introduced for framed list and inspection commands alongside the remaining CLI presentation surfaces. Decide which parts are portable `ki-tools` guidance and which are specific to `tools-ki`, then make the relevant standard discoverable from this repository's declared skills.
