---
id: KI-TOOL-CLI-063
title: Resolve external Agora references
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: c242892f0fd91f06f4422bacc6e1b88a45accb93
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

- [x] Define a machine-local association from canonical reference identity to one explicitly selected absolute Git checkout root.
- [x] Validate Git worktree status and canonical remote identity without requiring `.ki.toml` or KI registration.
- [x] Report `unassociated`, `missing`, `ambiguous`, and `remote-mismatch` diagnostics while omitting only unresolved reference roots.
- [x] Return explicit `owner`, `member`, and `reference` root classifications through resolution and projection seams.
- [x] Extend audit, roots, open, and editor projection commands without cloning, peer mutation, or automatic candidate selection.
- [x] Cover plain Git, unavailable association, duplicate candidates, promotion to reciprocal membership, and removal without peer mutation through the CLI test seam.

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

## Review

### Delivered

Implemented explicit machine-local associations for owner-declared external Agora references and integrated resolved reference roots into Agora inspection, audit, roots, open, and editor projection.

The implementation commit is `c1b509b64940b10a8cb40dc6041f05d0a6534d4c` against immutable baseline `c242892f0fd91f06f4422bacc6e1b88a45accb93`. A prerequisite coverage repair for the concurrently landed VS Code reconciliation surface is committed separately as `c92bb5c4436644463d02593d162b40f8f0a67d59`.

### Summary of changes

- Added `ki agora reference set`, `list`, and `remove`, backed by a deterministic XDG state document.
- Validated physical Git checkout roots and canonical GitHub origin identities through injected runner and environment capabilities.
- Added typed owner, member, and reference roots plus unresolved-reference diagnostics without weakening reciprocal membership validation.
- Kept `ki repo --agora` member-only while extending the Agora-specific roots, open, audit, inspect, list, and show surfaces.
- Updated completions, help inventory, man page, changelog, specification, README, and an operational guide.

### Verification

- `bunx tsc --noEmit` passed.
- `bun run test` passed: 46 files and 714 tests.
- `bun run test:coverage` passed at 100% statements, branches, functions, and lines.
- `bunx biome check` passed across 242 files.
- `mandoc -T lint man/ki.1` passed.
- Focused `ki-engineering`, `ki-repo-tools`, `ki-self`, `ki-authoring`, `ki-guides`, `ki-specs`, and `ki-agora` repository audits passed.
- The whole-repository `ki-repo` audit had no failures; its two existing `.ki.toml` presentation warnings remain outside this item.

### Outstanding concerns

None within the approved scope. The two pre-existing `.ki.toml` presentation warnings are unchanged and are not Agora-reference defects.

### Post-change review

The public CLI, core boundaries, documentation, completions, manual, and contract tests agree on the explicit-association model. External references remain separate from governed reciprocal members, and all repository operations continue to target members only. No clone, network request, peer write, or referenced-checkout mutation path was introduced.

### Mini recap

The durable learning is that an Agora may project a broader working set than its governed membership, but the distinction must remain typed at the resolution boundary. That contract is now captured in `docs/specs/agoras.md`; operational recovery and promotion guidance lives in `docs/guides/agora-references.md`.

## Done

Accepted by Kris Brown on 2026-09-07 after review of the delivered boundary, verification evidence, and outstanding concerns.

## Discussion

The first viable slice should make association explicit and classification visible. An unresolved optional reference should reduce only the projected reference roots, never the governed Agora membership result.
