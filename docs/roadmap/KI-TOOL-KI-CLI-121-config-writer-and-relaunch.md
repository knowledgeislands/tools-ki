---
id: KI-TOOL-KI-CLI-121
area: CLI
title: Config writer and relaunch
kind: deliver
purpose: corrective
project: agent-host
component: bootstrap
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-12T05:57:09Z
updated_at: 2026-10-12T05:57:09Z
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

## Discussion

Master state-of-play Decision 114 asks for the configuration-writer fix; the run brief adds the re-launch defect to the same small record.
