---
id: KI-TOOL-CLI-019
title: Re-engineer feature definitions
theme: cli
horizon: soon
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Give `tools-ki` a concise, testable as-built Feature Definitions corpus that lets maintainers understand its public CLI contract without reconstructing it from source and tests.

## Context

The current corpus covers only `ki repo audit`, while the public CLI also covers acquisition, bootstrap, harnesses, skills, repository operations, management, Agoras, and trades. The existing test suite provides concrete verification hooks for this re-engineering pass.

## Boundary

This work documents current observable behaviour only. It does not add CLI behaviour, rewrite tests, or change portable Feature Definitions semantics.

## Shaping

Retain the existing `REPO-AUDIT` identifiers and add small, flat areas that follow the public command boundaries. Keep each requirement behaviour-level, cite an existing CLI test as its verification hook, and place unbuilt behaviour in `Gaps`. Submit the resulting Guides-skill learning to the Harness as a knowledge trade; the Harness retains all decisions on changing its skill.

## Discussion

### Corpus boundary

Coverage means every public command group has an intelligible as-built contract, not that every command option receives a requirement. The corpus should identify durable behaviour and its verification seam while leaving procedural material to guides and implementation detail to source and tests.
