---
name: ki-self
ki-kind: governance
ki-depends-on: []
description: >
  Repository-local governance for tools-ki. Use when changing this CLI's
  bootstrap inventory, managed-skill activation or repair, harness discovery,
  native operation boundaries, or human-facing presentation conventions. Keeps
  repository-specific standards auditable without promoting them prematurely
  into a portable Knowledge Islands skill.
argument-hint: 'audit | conform | educate | refresh | help'
---

# KI Self

`ki-self` owns auditable standards specific to `tools-ki`. It complements [AGENTS.md](../../../AGENTS.md): that file provides the working contract for every contribution, while this skill records local product-governance requirements that need an explicit rubric. Its committed native catalogue runs through `ki repo audit --skill ki-self` and `ki repo conform --skill ki-self`; read [the generated rubric](references/rubric.md) before changing covered host surfaces.

Promote a concern that recurs across repositories into the shared Harness skill that owns it rather than duplicating it here.

## Operating modes

### Mode AUDIT

Run `ki repo audit --skill ki-self --repo <tools-ki-root>`, then assess the judgment criteria in the generated rubric. Treat an audit failure as evidence to diagnose; do not restore a retired wrapper, hard-coded source path, compatibility branch, or framed display merely to make it disappear.

### Mode CONFORM

Run `ki repo conform --skill ki-self --repo <tools-ki-root>` to publish safe catalogue-owned changes, then apply any source correction deliberately. Preserve unrelated work, keep the bootstrap inventory authoritative in one source, preserve the boundary between human-facing reports and contract-oriented output, and verify the affected CLI contract before making an explicit commit.

### Mode EDUCATE

Explain the boundary between this repository's host-specific rules, the portable owner of a reusable concern, and always-loaded contribution instructions.

### Mode REFRESH

Refresh only this committed source catalogue and its generated publication. A repository-local `ki-self` remains repository-authored and explicitly declared; never turn it into an installed-Harness fallback or general local-code provider.

### Mode HELP

Describe the local-governance boundary, covered classifications, and relationship to `AGENTS.md`.
