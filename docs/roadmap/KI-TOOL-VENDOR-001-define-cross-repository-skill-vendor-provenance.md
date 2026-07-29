---
id: KI-TOOL-VENDOR-001
title: Define cross-repository skill vendor provenance
theme: cross-repository-vendoring
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: knowledgeislands/ki-agentic-harness:foundation-tooling
---

## Context

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or ambient filesystem path.

## Boundary

Do not weaken the rule that only a provider in the same physical harness checkout may be symlinked; an external provider requires an explicit portable vendor or installation contract.
