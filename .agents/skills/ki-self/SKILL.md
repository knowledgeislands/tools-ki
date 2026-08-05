---
name: ki-self
ki-kind: governance
ki-depends-on: []
description: >
  Repository-local governance for tools-ki. Use when changing this CLI's bootstrap inventory, managed-skill activation or repair, harness discovery, native operation boundaries, or human-facing presentation conventions. Keeps repository-specific standards auditable without promoting them prematurely into a portable Knowledge Islands skill.
argument-hint: 'audit | conform | educate | refresh | help'
---

# KI Self

`ki-self` owns auditable standards specific to `tools-ki`. It complements [AGENTS.md](../../../AGENTS.md): that file provides the working contract for every contribution, while this skill records local product-governance requirements that need an explicit rubric.

Read [the rubric](references/rubric.md) before changing the covered host surfaces. Promote a concern that recurs across repositories to its shared harness skill rather than duplicating it here.

## Operating modes

### Mode AUDIT

Inspect the covered bootstrap, classification, repair, and human-facing presentation invariants against the rubric. Report the affected source and corrective action. Treat an audit failure as evidence to diagnose; do not restore a retired wrapper, hard-coded source path, compatibility branch, or framed display to make it disappear.

### Mode CONFORM

Apply only safe repository-local corrections. Preserve unrelated work, keep the bootstrap inventory authoritative in one source, preserve the boundary between human-facing reports and contract-oriented output, and verify the affected CLI contract before making an explicit commit.

### Mode EDUCATE

Explain the boundary between this repository's host-specific rules, the portable owner for a reusable concern, and the always-loaded contribution instructions.

### Mode REFRESH

Refresh only this committed source and its rubric. The portable lifecycle for repository-local `ki-self` is proposed in [TRD-af376594](../../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md); do not invent an installed-harness fallback while that decision remains with the harness.

### Mode HELP

Describe the local governance boundary, the covered classifications, and the relationship to `AGENTS.md`.
