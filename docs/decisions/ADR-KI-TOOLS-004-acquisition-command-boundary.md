---
id: ADR-KI-TOOLS-004
title: 'Acquisition command boundary'
date: 2026-09-30
status: current
decision_type: architecture
decision_type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_depends_on:
  - ADR-KI-TOOLS-001
---

# ADR-KI-TOOLS-004: Acquisition command boundary

## Context

The `ki` executable hosts acquisition commands and their repository-facing output. Granola processing currently ships with that executable, while acquisition implementations may change more often than core repository operations. An external command convention like Git's executable dispatch could let independently released acquisition tools provide command families, but it would introduce discovery, version compatibility, trust, error-reporting, and installation boundaries that the current CLI does not define.

## Decision

We keep acquisition commands, including Granola, in the main `ki` codebase and release for the present architecture. Command grammar and human-facing reporting remain owned by the CLI host; acquisition processing stays behind typed core boundaries. We do not dispatch unknown commands to executables on `PATH` or treat an executable named like `ki-acquire-granola` as a registered extension.

## Consequences

- Acquisition processing changes currently require a new `ki` release.
- Core acquisition modules should remain separable from command registration and presentation so a later extraction does not require untangling CLI output from processing.
- An external-command model remains a possible architecture change, not an implied compatibility promise. Adopting it would require a separate decision covering explicit registration, executable trust, versioned inputs and outputs, error semantics, and release ownership before any dispatch behaviour changes.

## References

- [ADR-KI-TOOLS-001](ADR-KI-TOOLS-001-typescript-native-command-host.md) — the native command host.
