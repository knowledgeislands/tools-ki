---
id: KI-TOOL-KI-CLI-121
area: CLI
title: Config writer and relaunch
kind: deliver
purpose: corrective
project: agent-host
component: bootstrap
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: 455495e8b9e0ba4f5513edea96238f25982b3f5d
created_at: 2026-10-12T05:57:09Z
updated_at: 2026-10-12T06:04:57Z
---

# Config Writer and Relaunch

## Goal

Every `ki` command that rewrites `~/.config/ki/config.toml` keeps the tables it does not own, such as `[territories]`, and a `ki` running from a source checkout re-launches its detached agent processes through the same runtime that started it.

## Context

Found on terra on 12 October 2026 after `ki` switched to local mode, where `~/.local/bin/ki` runs `bun src/main.ts` through `.ki-local-runner`:

- `ki dev local on` rewrote the user configuration without the `[territories] ranking` delivered by the now-closed ranking record, because `renderConfiguration` in `src/agents/configuration.ts` writes only agents, harnesses, skills, locals and repositories. The file had to be restored from chezmoi. Bootstrap refresh, harness install and skill activation share the same writer.
- `ki agent launch` with a held gate and `ki agent dispatch` fail with `EACCES: permission denied, posix_spawn '.../src/main.ts'`: the detached re-launch spawns `context.executable`, which in local mode is the entry script, not an executable.

## Boundary

- **In:** the shared configuration writer, the detached re-launch command in `ki agent`, CLI tests through `run(args, context)`, and affected specifications or guides.
- **Out:** the meaning of any preserved table, chezmoi sources, live configuration on any machine, installers and releases.

## Current state

[The configuration writer](../../src/agents/configuration.ts) renders the whole file from the bootstrap inventory; [bootstrap](../../src/agents/bootstrap.ts) and the local-source and skill setters call it directly. Its inspection also warns that `territories` and `mcp` are unrecognised keys, although [the ranking reader](../../src/core/territory/ranking.ts) and the MCP inventory reader own them. [Agent runs](../../src/core/agent/runs.ts) start the hold and dispatcher processes with `context.executable` as the command, and [the context](../../src/context.ts) sets that to the entry script when `ki` runs from source.

## Steps

- [ ] Route every configuration rewrite through one writer that reads the current file and appends each top-level table outside the bootstrap-owned keys, by value; stop inspection warning about the tables other readers own.
- [ ] Add a context launcher: the executable for a compiled `ki`, or the runtime followed by the entry script in local mode; start the hold and dispatcher processes with it.
- [ ] Prove both through the public CLI: a `dev local on` and `bootstrap --refresh` cycle keeps `[territories]` and `[mcp]`, and a local-mode dispatch starts the runtime with the entry script.
- [ ] Extend BOOT-002 to require preserving unowned tables.

## Files touched

`src/agents/configuration.ts`, `src/agents/bootstrap.ts`, `src/context.ts`, `src/core/agent/runs.ts`, `src/commands/agent/index.ts`, `src/tests/cli/_cli_helper.ts`, `src/tests/cli/dev/dev.test.ts`, `src/tests/cli/agent.test.ts` and `docs/specs/bootstrap.md`.

## Verify

`bun run test:coverage` at 100%, TypeScript, Biome, `mandoc -T lint`, the command inventory test, Markdown lint and `ki repo audit`.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None.

### Specifications

BOOT-002 gains the unowned-table requirement and its test.

### Guides

None; no user-visible command changes.

### Roadmap

Immediate delivery under Decision 114, stopping at Awaiting review.

## Discussion

Master state-of-play Decision 114 (12 October 2026, 06:45 BST) asks for the configuration-writer fix found after the ranking record closed; the run brief adds the re-launch defect to the same small record and authorises adoption, planning, delivery and push, but no acceptance or release.

Preserved tables are re-serialised by value, so their comments and layout are not kept; every writer already re-renders the owned tables the same way. Keeping text verbatim would need a section-level TOML splice for no behavioural gain.
