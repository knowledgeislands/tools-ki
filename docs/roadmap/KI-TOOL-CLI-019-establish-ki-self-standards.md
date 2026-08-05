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

Give this repository a `ki-self` governance skill with its own rubric, so the `ki` host's repository-specific operating standards are auditable rather than being an informal alternative to `AGENTS.md` or `CLAUDE.md`.

## Context

`tools-ki` has accumulated local expectations through its CLI contract, output conventions, release surfaces, and runtime-host responsibilities. Some may generalise to every Knowledge Islands tools repository and belong in `ki-tools`; others apply only to this CLI and need a clear local home. Without that boundary, repository-specific standards are either absent from durable guidance or risk being promoted into a general skill prematurely.

## Boundary

This item does not replace always-loaded contribution instructions, promote local rules into `ki-tools`, make `ki-self` a bootstrap user skill, or independently define the portable lifecycle of a repository-local skill. It specifies the local capability and asks the harness to formalise the reusable contract deliberately.

## Required shape

`ki-self` is repository-local governance, not a process skill and not a second instruction file. `AGENTS.md` and runtime instruction files remain the operational contract that applies to every contribution. `ki-self` owns the narrower set of durable, inspectable requirements that are specific to this CLI host, including a rubric with named criteria, evidence surfaces, and judgment boundaries.

The source must remain committed in this repository. A runtime projection is derived state, not a copied or independently authored skill. The portable discovery, projection, native audit/conform execution, and rubric-publication lifecycle remain for the harness to formalise.

## Initial rubric coverage

The first `ki-self` rubric must define and check the following concerns.

### Bootstrap classifications

- Identify the canonical bootstrap user-skill inventory from one named, typed authority; do not duplicate the list in bootstrap, refresh, local-development, or repair logic.
- Distinguish a bootstrap skill, configured managed identity, resolved source, and agent-runtime projection. Require each path of the host to preserve those distinctions rather than treating a configured identity or projection as the inventory itself.
- Resolve sources from inspected harness capabilities, never from an assumed `skills/<kind>/<name>` directory layout.

### Bootstrap and repair coverage

- Verify that bootstrap, refresh, and local-development activation use the canonical bootstrap inventory and fail before projection when a required member is unavailable.
- Verify that `ki manage repair` covers every canonical bootstrap skill and any additional configured managed skill. It must report unavailable sources and incompatible agents, and must exit non-zero when it cannot restore the required managed state.
- Verify that active canonical local-harness development supplies repair sources through capability discovery, rather than a reconstructed skill path.

### Scope classification

- Use the rubric to classify local host concerns: bootstrap and projection management, native operation boundaries, output and release conventions, and other stable product rules.
- Promote a requirement that applies across compatible repositories to its portable harness owner instead of growing `ki-self` into a catch-all instruction surface.

## Discussion

### Ownership boundary

Inventory the standards currently expected by this repository, classify each as portable or repository-specific, and record the latter in `ki-self`. Keep `ki-tools` focused on standards that are demonstrably useful across compatible CLI repositories. Treat an existing local convention as evidence to evaluate, not automatic justification for a new general rule.

### First application

Review the output conventions introduced for framed list and inspection commands alongside the remaining CLI presentation surfaces. Decide which parts are portable `ki-tools` guidance and which are specific to `tools-ki`, then extend the local rubric only where a stable evidence surface exists.

### Portable lifecycle

The harness already recognises a committed `.agents/skills/ki-self/` source as repository-authored governance and runtime projections as derived links. [TRD-af376594](../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md) asks it to formalise the remaining portable shape: discovery, activation, native audit/conform execution, and generated rubric publication. Until that work is accepted, this item must not claim that `ki-self` is an installed harness capability.
