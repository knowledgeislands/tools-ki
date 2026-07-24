---
id: ADR-KI-TOOLS-001
title: 'TypeScript-native command host'
date: 2026-07-24
status: current
type: Architecture Decision Record
type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_type: architecture
---

# ADR-KI-TOOLS-001: TypeScript-native command host

## Context

The initial `ki` development surface is implemented by a single Bash executable.

That shape is sufficient for a seed command and simple local inspection, but it does not provide typed command boundaries, reusable operation APIs, or an appropriate host for native repository maintenance.

`ki repo audit` and `ki repo conform` must discover and execute registered capability operations from verified harnesses without dispatching legacy generated shell runners.

## Decision

`tools-ki` adopts a Bun and TypeScript command host.

The executable composes typed, in-process command modules through Commander; KI-owned modules provide parsing models, diagnostics, XDG paths, repository resolution, capability discovery, and operation execution.

Release distribution uses Bun-compiled standalone executables for supported platforms.

Development runs the same source entry point with Bun; a linked development installation remains explicitly distinct from a regular released installation.

## Consequences

- Existing released command behaviour is ported to typed modules before new command groups expand the surface.
- Native audit and conform operations can call verified TypeScript capability APIs directly rather than execute repository-vendored scripts.
- The tool gains the `ki-engineering` standard alongside the `ki-tools` container standard.
- The release process produces and verifies platform-specific executable artefacts; the installer and Homebrew formula consume those artefacts rather than source shell code.
- Bun is a development dependency and build tool, but is not required to run an installed compiled release executable.

## References

- [Bun standalone executable builds](https://bun.sh/docs/bundler/executables)
- [Commander](https://github.com/tj/commander.js/)
