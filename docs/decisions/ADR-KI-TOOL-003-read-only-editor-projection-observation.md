---
id: ADR-KI-TOOLS-003
title: 'Read-only editor projection observation'
date: 2026-09-01
status: current
decision_type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_type: architecture
decision_depends_on:
  - ADR-KI-TOOLS-001
---

# ADR-KI-TOOLS-003: Read-only editor projection observation

## Context

An Agora is a portable declaration of repository membership, while an editor workspace is application-owned, machine-local state. Comparing the two is useful only when `ki` can explain exactly which source it observed, preserve the canonical Agora resolver as the source of expected membership, and avoid changing either side of the comparison.

VS Code exposes a physical `.code-workspace` document with JSONC folder records. Zed persists stable and preview workspace records in separate local SQLite databases whose schema is application-owned and may change independently of `ki`. Guessing the active or recent editor workspace, interpreting an unsupported schema, or writing editor state would make inspection ambiguous or unsafe.

## Decision

`ki agora inspect` observes one explicit target and workspace selector through a target adapter. The VS Code adapter accepts only an absolute physical `.code-workspace` file and decodes its path and URI folder records. The Zed adapter accepts only a decimal workspace ID, searches the stable and preview application databases read-only, validates the required workspace schema before selecting that ID, and rejects unavailable, remote, ambiguous, or unsupported records without guessing an alternative.

After target decoding, one target-neutral classifier compares canonical physical roots with the canonical resolved Agora profile. It reports matched members, missing members, extra registered repositories, unregistered KI repositories, and external roots in deterministic order. Observation never writes editor files or databases, repository declarations, the local registry, or portable configuration, and it never records machine-local paths in a portable artefact.

## Consequences

- Each editor integration owns only source location, selector validation, and decoding; Agora resolution and drift semantics remain shared.
- New editor targets can join the same observation contract without adding target-specific branches to Agora resolution or classification.
- A changed or unavailable application-owned schema produces an explicit unsupported result until its adapter is updated.
- Users must select a workspace explicitly; `ki` does not infer one from editor activity or recency.
- Inspection remains local, deterministic, and non-mutating, but support depends on readable local editor state.

## References

- [ADR-KI-TOOLS-001](ADR-KI-TOOLS-001-typescript-native-command-host.md) — TypeScript-native executable host.
- [VS Code multi-root workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) — physical workspace-file format.
- [Zed workspace persistence](https://github.com/zed-industries/zed/blob/main/crates/workspace/src/persistence.rs) — application-owned persisted workspace state.
