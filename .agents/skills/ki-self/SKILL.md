---
name: ki-self
ki-kind: governance
ki-depends-on: []
description: >
  Repository-local governance for tools-ki. Use when changing or reviewing the CLI's product architecture, command/core boundaries, contract-test and coverage policy, bootstrap inventory, managed-skill activation or repair, Harness discovery, native-operation boundaries, or human-facing presentation. Keeps repository-specific standards auditable without duplicating portable Knowledge Islands skills.
argument-hint: 'audit | conform | educate | refresh | help'
---

# KI Self

`ki-self` owns auditable standards specific to `tools-ki`. [AGENTS.md](../../../AGENTS.md) is the short always-loaded orientation; this skill holds the detailed product-governance contract and its review criteria. The committed native catalogue runs through `ki repo audit --skill ki-self` and `ki repo conform --skill ki-self`.

Read:

- [the product-engineering standard](references/standards-product-engineering.md) for architecture, test, coverage, portability, and release-boundary goals;
- [the generated rubric](references/rubric.md) before changing any covered host surface.

Promote a concern that recurs across repositories into the portable Harness skill that owns it rather than duplicating it here.

## What this skill owns

1. Product architecture boundaries unique to the `ki` host, including provider-neutral dispatch and the command/core/presentation split.
2. Repository-specific application of observable CLI contract testing, injected capabilities, coverage exclusions, and fixture-migration safety.
3. Bootstrap inventory, managed user-skill projection, repair, Harness discovery, and repository-local native-operation boundaries.
4. The distinction between framed human reports and stable contract-oriented output.
5. Local ownership routes that connect `tools-ki` to portable Harness and specification standards without copying them.

## Operating modes

### Mode AUDIT

Run `ki repo audit --skill ki-self --repo <tools-ki-root>`, then assess every judgment criterion in the generated rubric against current code, tests, documentation, and public output. Treat mechanical failure as evidence to diagnose; do not restore retired wrappers, hard-coded source paths, compatibility branches, or framing merely to make a finding disappear.

### Mode CONFORM

Run `ki repo conform --skill ki-self --repo <tools-ki-root>` for catalogue-owned safe corrections. Apply judgmental corrections deliberately: preserve unrelated work, keep bootstrap inventory authoritative in one source, preserve command/core and human/contract output boundaries, and verify affected behaviour through the CLI seam before committing.

### Mode EDUCATE

Explain the tools-ki product goals, their portable owners, the repository-local rubric, and why `AGENTS.md` remains a short pointer rather than a second standard.

### Mode REFRESH

Refresh only this committed source catalogue, its local standards, and generated publication. If a rule has become reusable across repositories, route it to the appropriate Harness skill instead of expanding `ki-self` into a portable fallback.

### Mode HELP

Describe the local-governance boundary, covered product goals, and off-ramps to `ki-engineering`, `ki-authoring`, `ki-repo-tools`, `ki-repo`, `ki-git`, and `ki-trades`.
