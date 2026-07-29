---
id: KI-TOOL-CLI-011
title: Reconcile managed user skills in local development mode
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: 'knowledgeislands/ki-agentic-harness@92d5b263'
---

## Context

`ki dev on /Users/krisbrown/workspaces/kis/knowledgeislands/ki-agentic-harness` correctly records the local checkout in `~/.config/ki/config.toml`, and `ki diag` reports that local source.

However, the managed runtime links remain pointed at an older temporary harness payload:

```text
~/.agents/skills/ki-recap
~/.claude/skills/ki-recap
  -> /private/tmp/ki-fnd001-tools.anDDmK/data/ki/harnesses/knowledgeislands/ki-agentic-harness/...
```

The user configuration also still records only the former five core process skills, rather than the current eight.

As a result, a runtime may load old skill content even though `ki diag` claims local development mode is active.

Local development mode must make the managed user skills and their configuration agree with its reported local harness source.

## Boundary

This item concerns KI-managed user-skill reconciliation for `ki dev on` and its idempotent re-run.

It does not change harness acquisition, release installation, repository-declared governance, foreign user skills, or the semantics of the process skills themselves.

It must not add a compatibility fallback between local and installed payloads: one active local source must be reflected by the managed runtime links.

## Current state

`ki dev local on` already validates the local checkout through `localBootstrapHarness()`, which returns both the physical harness root and the current managed core skill sources.

It then enables the canonical payload projection but discards those validated local sources, instead reading `installedBootstrapSkillSources()` and calling `installBootstrapSkills()` without replacement.

Existing managed links therefore remain pointed at their former installed source, and `refreshUserConfiguration()` discovers that stale set when it rewrites `config.toml`.

## Steps

1. Make `ki dev local on` project the already-validated local managed core skill sources into every configured runtime, re-pointing only recognised KI-managed links so each link resolves to the active local checkout.
2. Refresh user configuration only after that reconciliation, ensuring the recorded managed-skill inventory and local-source declaration match the links actually installed.
3. Preserve foreign filesystem entries and unfamiliar links as fail-closed errors; an idempotent re-run against the same local checkout reports no unnecessary change while retaining the local targets.
4. Add black-box CLI contracts starting from stale managed links: assert `ki diag`, configuration, and every configured runtime link all resolve to the local source; repeat `ki dev local on` and prove idempotence.
5. Update local-development guidance with the reconciliation contract and run the full type, CLI, coverage, and repository-governance gates.

## Files touched

- `src/commands/dev.ts` and the focused agent bootstrap/linking helpers required to preserve managed-link ownership checks
- `src/tests/cli/dev.test.ts` and any shared CLI sandbox fixture needed to represent stale managed links safely
- `docs/developer/local-development.md`

## Verify

1. `bunx tsc --noEmit`
2. `bunx vitest run src/tests/cli/dev.test.ts`
3. `bun run test:coverage`
4. `./bin/ki repo audit --repo .`
5. The CLI contract proves that every managed local-development skill link, `ki diag`, and `config.toml` identify one local source before and after an idempotent re-run.

## Dependencies / blocks

CLI-011 has no blocking roadmap dependency. It transfers implementation evidence from `knowledgeislands/ki-agentic-harness@92d5b263` but remains owned and independently executable in `tools-ki`.

## Discussion

### Evidence

The mismatch was observed after the harness added `ki-implement`, `ki-accept`, and `ki-batch`, and updated `ki-recap`'s compaction boundary.

The canonical source was at `knowledgeislands/ki-agentic-harness@92d5b263`; `ki diag` showed that checkout as `Local source`, while both runtime links resolved to the older temporary payload and therefore exposed stale `ki-recap` content.

### Intended contract

`ki dev on <path>` should validate the local harness and reconcile every KI-managed core user skill from that local source into each configured detected runtime.

It should update the recorded managed-skill inventory from the current source, be safe to repeat, preserve foreign entries, and report the source actually linked.

### Verification shape

Use the existing black-box CLI sandbox contract.

Start from a managed old payload, enable local mode against a fixture harness containing the current core skill set, then assert that `ki diag`, `config.toml`, and every managed runtime link agree on the local source.

Repeat the command and assert idempotence.

### Direct promotion rationale

The observed stale runtime content is an active correctness issue in the development workflow, and the handoff identifies both its immediate failure mode and an executable black-box verification shape.

The implementation boundary is limited to the already-established canonical local harness and managed user-skill projection paths, so a Soon shaping stage would add no useful uncertainty.
