---
id: KI-TOOL-CLI-050
title: Generalise local Harness development
area: CLI
theme: cli
horizon: next
status: in-progress
blocks: [KI-TOOL-VENDOR-001]
blocked_by: []
baseline_ref: 1cca1edf19bb27a8d963172ce989937aa95906c7
---

## Goal

Allow a contributor to activate local development mode for any Harness already installed in the local KI estate, so an external Harness can be changed and exercised through the real `ki` resolution path without replacing the canonical Harness or presenting a mutable checkout as the installed release.

## Context

`ki` can install and discover several compatible Harnesses, but `ki dev local` is hard-coded to `knowledgeislands/ki-agentic-harness`. Developing another installed Harness therefore requires manual mutation of KI-managed data or continued use of its last installed payload, neither of which exercises a safe and reversible supported path.

Local mode is singular today: one remembered checkout can be enabled and disabled. This work preserves that comprehensible model while identifying which installed Harness the source replaces. It does not introduce concurrent local overrides, new release provenance, or a second capability-resolution model.

## Boundary

Extend the existing grammar to `ki dev local set <harness-id> <local-harness-path>`, while `ki dev local on` and `ki dev local off` operate on the remembered Harness. `set` accepts only an identity already present in the installed estate and validates the checkout as that Harness before recording it.

The `[local]` user-configuration table records both `harness` and `path`. Enabling replaces only that Harness's installed payload roots with recognised links to the selected checkout. Disabling reinstalls the same Harness from its configured immutable release and reprojects affected managed skills. Other installed Harnesses and their projections remain unchanged.

The canonical Harness retains its existing bootstrap-capability protections. A non-canonical Harness is not required to provide canonical bootstrap skills. No ambient checkout discovery, prefix policy, provider manifest, receipt, or qualified-capability change belongs in this item.

## Current state

- User configuration can remember only `[local].path`; it cannot identify the Harness the path replaces.
- Development operations inspect every checkout as the canonical Harness and require its bootstrap skills.
- Storage links and restoration target only the canonical installed directory.
- Managed-skill refresh treats every local skill as if the canonical Harness supplied it.
- Harness reinstall and diagnostics recognise only canonical development links.

## Steps

- [ ] Add the remembered Harness identity to the existing local configuration contract and render, inspect, refresh, and diagnose it consistently.
- [ ] Inspect a requested local source against its named installed Harness, require that identity to exist in the installed estate, and retain canonical bootstrap checks only for the canonical identity.
- [ ] Generalise payload linking, active-link detection, restoration, and replacement guards from the canonical directory to one named installed Harness while preserving safe rollback and unfamiliar-state refusal.
- [ ] Reproject managed user skills from the active local source under the selected Harness identity, leaving skills from every other installed Harness unchanged.
- [ ] Update `ki dev local set` grammar, output, help, completion, README, manual, development specification, local-development guide, and ADR wording for the named installed-Harness contract.
- [ ] Cover canonical and non-canonical set/on/off cycles, estate validation, independent installed Harnesses, managed projections, repeated transitions, unsafe links, failed restoration, and deterministic diagnostics through the CLI `sandbox()` seam.

## Files touched

Expected surfaces are `src/commands/dev/`, `src/core/harness/development/`, `src/core/storage/`, `src/agents/`, development and Harness CLI tests and fixtures, completion rendering, `docs/specs/development.md`, ADR-KI-TOOLS-002, the local-development guide, README, and `man/ki.1`.

## Verify

- `bunx vitest run src/tests/cli/dev/dev.test.ts src/tests/cli/harness/harness.test.ts`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bunx knip`
- `ki repo audit --repo .`
- A non-canonical installed Harness can be set, enabled, resolved from its local checkout, disabled, and restored without changing the canonical Harness or another installed Harness.

## Dependencies / blocks

No implementation dependency. This item blocks KI-TOOL-VENDOR-001 because that work needs a supported local-development path for the HNR Harness before assessing any remaining external-provider gap.

## Delegation

No durable delegation packet is needed. Configuration, storage, projection, and command changes share one state transition and should be implemented sequentially against the same contract.

## Documentation impact

### Decision Records

Clarify that local development can substitute one named installed Harness and never changes its configured release evidence.

### Specifications

Generalise DEV-001 through DEV-003 from the canonical Harness to a named installed Harness and add the unchanged-neighbour contract.

### Guides

Show the named `set` command and the reversible on/off lifecycle for canonical and external Harness checkouts.

### Roadmap

Complete this prerequisite before resuming KI-TOOL-VENDOR-001.

## Discussion

The installed estate is the authority for eligible identities. The local source is a temporary development substitute for one known installation, not a way to register a new Harness or establish production provenance.
