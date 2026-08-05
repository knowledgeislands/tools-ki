---
id: KI-TOOL-CLI-018
title: Decouple Agora targets
theme: cli
horizon: future
status: draft
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make an Agora describe only a named collection of physical projects. It must not persist an editor or other opening tool as part of that collection's identity.

## Context

The current `.ki-agora` format requires `tool = "zed"`, and `ki agora open` consequently has one hard-coded integration. A project collection can be useful independently of how it is opened; Zed, VS Code, and later targets belong at the execution boundary, not in the stored profile.

This change also makes the Agora model a better consumer of a future neutral physical path-set codec, without collapsing Agora's user-managed collection semantics into the registered KI repository estate.

## Boundary

This item does not merge the registry estate with Agora, decide the registry's future storage format, or add support for every editor. It does establish that no editor target is stored in `.ki-agora` and that any retained opening command selects its target through an explicit current CLI contract.

## Discussion

### Editor targeting

The profile format should retain only profile identity, display metadata, and project membership. The implementation must remove the `tool` attribute from generated, parsed, rendered, documented, and tested profile forms.

The opening operation needs a deliberate follow-up command grammar: it may require an explicit target such as `--target zed`, or use a separately configured default. Either design must keep that preference out of the Agora file and preserve a clear failure when no target can be resolved.

### Project-set reuse

An Agora remains a user-curated project collection and may contain a physical directory that is not a KI repository. The registry remains a system-maintained estate used for KI-repository and trade discovery. A later shared codec must therefore represent path membership without absorbing either lifecycle policy.
