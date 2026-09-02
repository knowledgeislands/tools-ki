---
id: KI-TOOL-CLI-063
title: Resolve external Agora references
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Associate owner-declared external Agora references with explicitly selected local Git checkouts and project typed owner, member, and reference roots safely.

## Context

`GDR-KI-HARNESS-006` and `ki-agora` now allow an Agora owner to name ordinary Git repositories as non-member working-set references. The portable declaration intentionally contains no local path. `tools-ki` owns the machine-local association, registry-aware resolution, roots, audit, open, and editor-projection seams.

## Boundary

Never register a reference as a KI repository, infer membership or consent, clone automatically, select among multiple checkouts, expose alternative local paths in ordinary diagnostics, mutate the referenced repository, or weaken reciprocal-member results when a reference is unresolved.

## Current state

Agora resolution projects registered owners and reciprocal members only. There is no machine-local reference association store or `reference` root classification.

## Steps

- [ ] Define a machine-local association from canonical reference identity to one explicitly selected absolute Git checkout root.
- [ ] Validate Git worktree status and canonical remote identity without requiring `.ki.toml` or KI registration.
- [ ] Report `unassociated`, `missing`, `ambiguous`, and `remote-mismatch` diagnostics while omitting only unresolved reference roots.
- [ ] Return explicit `owner`, `member`, and `reference` root classifications through resolution and projection seams.
- [ ] Extend audit, roots, open, and editor projection commands without cloning, peer mutation, or automatic candidate selection.
- [ ] Cover plain Git, unavailable association, duplicate candidates, promotion to reciprocal membership, and removal without peer mutation through the CLI test seam.

## Files touched

- Agora core resolution and local state modules
- Agora CLI commands and projection adapters
- `src/tests/cli/` Agora coverage
- User-facing association and recovery guide
- This work item

## Verify

- Focused Agora CLI tests
- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- Repository and engineering audits required by this repository

## Dependencies / blocks

No implementation blocker remains. Consume the committed harness reference contract; target-specific launch behaviour remains a host concern.

## Documentation impact

### Decision Records

Create a local-state decision only if the association store introduces a new durable host architecture choice.

### Specifications

Specify public association, resolution, diagnostic, roots, audit, and open behaviour.

### Guides

Document association, reassociation, unresolved recovery, promotion, and removal workflows.

### Roadmap

This record is the receiver-owned host follow-on from `KI-HARNESS-GOV-052`.

## Discussion

The first viable slice should make association explicit and classification visible. An unresolved optional reference should reduce only the projected reference roots, never the governed Agora membership result.
