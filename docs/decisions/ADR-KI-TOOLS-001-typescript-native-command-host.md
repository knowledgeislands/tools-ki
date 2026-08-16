---
id: ADR-KI-TOOLS-001
title: 'TypeScript-native command host'
date: 2026-07-24
status: current
decision_type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_type: architecture
---

# ADR-KI-TOOLS-001: TypeScript-native command host

## Context

`ki` is the Knowledge Islands command-line interface. Bun executes the TypeScript sources under `src/` directly, so development and testing need no separate transpilation or intermediate JavaScript build step; `bun build --compile` compiles that same source into a standalone, platform-specific binary for release.

The host must provide typed command boundaries, reusable operation APIs, and be an appropriate base for native repository maintenance. `ki repo audit` and `ki repo conform` must discover and execute registered capability operations from verified compatible harnesses in process, without dispatching generated shell runners.

The command surface follows established conventions rather than inventing its own. Commander supplies the command-tree and argument-parsing model, and the XDG Base Directory Specification governs where the host reads and writes configuration, data, cache, and state.

## Decision

`tools-ki` is a Bun-native TypeScript command host end to end.

Bun is both the runtime and the compiler. It executes `src/main.ts` and its TypeScript module graph directly for development and testing, and `bun build --compile` compiles that same source into a standalone platform-specific executable for release; no separate transpile step or intermediate JavaScript build exists.

The executable composes typed, in-process command modules through Commander, giving the host one command tree rather than a shell dispatch table. `src/commands/` holds thin Commander bindings, `src/core/` holds the engine — parsing models, diagnostics, XDG paths, repository resolution, capability discovery, and operation execution — and `src/agents/` holds agent-facing capability integration.

Tests exercise the CLI contract, not internals: see AGENTS.md's "Test the contract, not the units" convention. Every test drives the in-process `run(args, context)` seam, asserting stdout, exit code, and on-disk effects, rather than unit-testing internal functions.

## Consequences

- Native `ki repo audit` and `ki repo conform` call verified TypeScript capability APIs directly — for example, an installed skill's rubric definition imports the host's `src/core/rubric.ts` contract — rather than executing repository-vendored scripts.
- Release and distribution ship a single compiled binary per platform. Bun is a development and build dependency only; a released, installed `ki` executable does not require Bun (or Node) on the target machine.
- The command tree, the `commands/` / `core/` / `agents/` module layout, and the interface-level test contract are the standard new command groups must follow.
- The tool conforms to the `ki-engineering` standard alongside the `ki-tools` container standard.

## References

- [Bun standalone executable builds](https://bun.sh/docs/bundler/executables)
- [Commander](https://github.com/tj/commander.js/)
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)
