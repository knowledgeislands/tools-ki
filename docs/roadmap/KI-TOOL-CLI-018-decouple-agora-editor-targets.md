---
id: KI-TOOL-CLI-018
title: Normalize Agora estate
theme: cli
horizon: future
status: draft
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make an Agora a neutral named set of canonical KI repositories, with one system-managed canonical Agora representing the registered estate. It must not persist an editor or other opening tool as part of that collection's identity.

## Context

The current `.ki-agora` format requires `tool = "zed"`, accepts arbitrary physical directories, and keys them only by their directory basename. `ki agora open` consequently has one hard-coded integration. That model cannot express the registered KI estate safely: membership needs a human-friendly local repository key and the declared canonical HTTPS repository identity, while an external source store or archived checkout is not itself a canonical KI repository.

The registry remains a first-class CLI surface, but its membership is the canonical system-managed Agora rather than a second collection model. The local key is the repository name used by local tools and mGit; the full canonical HTTPS home remains the identity used for validation and trades.

Tool workspaces are a separate layer. A VS Code, Zed, or later target can assemble one or more canonical repository members with declared non-repository stores such as `sources` and `legacy`, without making those stores registered KI repositories.

## Boundary

This item does not define the portable `ki-repo` contract for repository kind and KB store roles, create every tool target, or make non-repository stores eligible for `ki repo` operations. It consumes the agreed contract in the CLI, establishes that no editor target is stored in `.ki-agora`, and retains the registry as the first-class management surface for the canonical estate.

## Discussion

### Canonical estate

The system-managed canonical Agora represents every locally registered canonical KI repository, whether it is a Knowledge Base or a non-KB repository. Registry commands retain their responsibility to add, list, diagnose, and repair this estate. Named Agoras select canonical repository members rather than arbitrary physical directories.

Each member needs a local repository-name key for user-facing configuration and integration with mGit, alongside its declared canonical HTTPS home. A name collision must be diagnosed rather than silently replacing a different canonical repository identity.

### Editor targeting

The profile format should retain only profile identity, display metadata, and project membership. The implementation must remove the `tool` attribute from generated, parsed, rendered, documented, and tested profile forms.

The opening operation needs a deliberate follow-up command grammar: it may require an explicit target such as `--target zed`, or use a separately configured default. Either design must keep that preference out of the Agora file and preserve a clear failure when no target can be resolved.

### Tool workspace composition

An editor or other target composes its workspace from canonical repository members and their declared stores. For example, a Knowledge Base may expose `notes` as its self-reference, then optional `sources` and `legacy` stores. The tool layer decides whether and how to open those stores, including their ordering and read-only treatment.

The portable definition of repository kind and store roles belongs to the `ki-repo` contract. This CLI item must not invent a private alternate schema.
