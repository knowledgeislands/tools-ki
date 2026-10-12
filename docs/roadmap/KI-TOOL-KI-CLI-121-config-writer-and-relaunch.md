---
id: KI-TOOL-KI-CLI-121
area: CLI
title: Config writer and relaunch
kind: deliver
purpose: corrective
project: agent-host
component: bootstrap
status: done
blocks: []
blocked_by: []
baseline_ref: 455495e8b9e0ba4f5513edea96238f25982b3f5d
created_at: 2026-10-12T05:57:09Z
updated_at: 2026-10-12T07:23:00Z
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

- [x] Route every configuration rewrite through one writer that reads the current file and appends each top-level table outside the bootstrap-owned keys, by value; stop inspection warning about the tables other readers own.
- [x] Add a context launcher: the executable for a compiled `ki`, or the runtime followed by the entry script in local mode; start the hold and dispatcher processes with it.
- [x] Prove both through the public CLI: a `dev local on` and `bootstrap --refresh` cycle keeps `[territories]` and `[mcp]`, and a local-mode dispatch starts the runtime with the entry script.
- [x] Extend BOOT-002 to require preserving unowned tables.

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

## Review

### Delivered

Commands that rewrite the user configuration (`ki bootstrap --refresh`, `ki dev local set|on|off`, skill activation) now keep every top-level table they do not own, so `[territories] ranking` and `[mcp]` survive. `ki diag` no longer calls those tables unrecognised. A `ki` running from source starts its detached hold and dispatcher processes as `<runtime> <entry script> agent …`, so `ki agent launch --wait-for` and `ki agent dispatch` work in local mode.

### Change Summary

- `src/agents/configuration.ts` adds `writeUserConfiguration`, which appends preserved unowned tables after the rendered inventory; the local-source and skill setters use it, and inspection recognises `territories` and `mcp`.
- `src/agents/bootstrap.ts` routes bootstrap creation and refresh through the same writer.
- `src/context.ts` adds `launcher` (executable, or runtime plus entry script in local mode, with an injectable `runtimeExecutable`); `src/core/agent/runs.ts` and `src/commands/agent/index.ts` start the hold and dispatcher with it.
- Tests: `src/tests/cli/dev/dev.test.ts` (`keeps the configuration tables it does not own when it rewrites the file`), `src/tests/cli/agent.test.ts` (`re-launches a local-mode ki through the runtime that runs its entry script`), and the `runtimeExecutable` pass-through in `src/tests/cli/_cli_helper.ts`.
- `docs/specs/bootstrap.md` extends BOOT-002.

### Verification

- `bun run test:coverage`: 67 files, 1,132 tests passed at 100% statements, branches, functions and lines.
- TypeScript, `mandoc -T lint`, command inventory test and `rumdl` passed; Biome warnings unchanged from baseline (26 warnings, 13 infos).
- `ki repo audit --repo .`: one failure and two warnings, all pre-existing on `main` — KNIP-2 (unused `src/core/estate/index.ts` exports), CI-1 and HOOK-1.
- Live on terra through the local runner with a temporary state root: `ki agent dispatch probe` started a detached dispatcher, which logged `queue empty, all finished`, without the earlier `EACCES`.

### Outstanding concerns

- Preserved tables are re-serialised, so comments and layout inside them are not kept and chezmoi will show a cosmetic diff after a rewrite (it already did for the owned tables).

### Post-change review

Writers that edit text surgically, such as the harness-registry recorder, were already safe and are unchanged. A compiled `ki` keeps launching itself directly; only local mode gains the runtime prefix.

### Mini recap

Both defects fixed with public CLI tests; not accepted, no release.

## Done

Accepted 2026-10-12 by Kris on the review packet above.

## Discussion

### Acceptance authority

Kris explicitly approved acceptance and eligible pruning on 12 October 2026: "can you approve/accept anything awaiting review and prune all done including those too please" (tools-burndown Decision 12). The independent review checked the unchanged producer packet at `85a5c766554641c037b01935eff174a47b73aa29`; immutable baselines, completed Steps and producer evidence remain intact. No release or remote operation is authorised.

Master state-of-play Decision 114 (12 October 2026, 06:45 BST) asks for the configuration-writer fix found after the ranking record closed; the run brief adds the re-launch defect to the same small record and authorises adoption, planning, delivery and push, but no acceptance or release.

Preserved tables are re-serialised by value, so their comments and layout are not kept; every writer already re-renders the owned tables the same way. Keeping text verbatim would need a section-level TOML splice for no behavioural gain.
