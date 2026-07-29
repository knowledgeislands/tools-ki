---
id: KI-TOOL-CLI-011
title: Reconcile managed user skills in local development mode
theme: cli
horizon: next
status: ready
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: 'knowledgeislands/ki-agentic-harness@92d5b263'
---

## Context

`ki dev local on /Users/krisbrown/workspaces/kis/knowledgeislands/ki-agentic-harness` currently combines selecting a local checkout with activating it, and records that checkout in `~/.config/ki/config.toml`.

However, the managed runtime links remain pointed at an older temporary harness payload:

```text
~/.agents/skills/ki-recap
~/.claude/skills/ki-recap
  -> /private/tmp/ki-fnd001-tools.anDDmK/data/ki/harnesses/knowledgeislands/ki-agentic-harness/...
```

The user configuration also still records only the former five core process skills, rather than the current eight.

As a result, a runtime may load old skill content even though `ki diag` claims local development mode is active.

Local development mode needs an explicit configured source and a distinct active state, so managed user skills, configuration, diagnostics, and health checks agree on the selected local harness.

## Boundary

This item concerns KI-managed user-skill reconciliation for `ki dev local set`, `on`, and `off`, including idempotent re-activation.

It does not change harness acquisition, release installation, repository-declared governance, foreign user skills, or the semantics of the process skills themselves.

It must not add a compatibility fallback between local and installed payloads: one active local source must be reflected by the managed runtime links.

## Current state

`ki dev local on <path>` already validates the local checkout through `localBootstrapHarness()`, which returns both the physical harness root and the current managed core skill sources.

It then enables the canonical payload projection but discards those validated local sources, instead reading `installedBootstrapSkillSources()` and calling `installBootstrapSkills()` without replacement.

Existing managed links therefore remain pointed at their former installed source, and `refreshUserConfiguration()` discovers that stale set when it rewrites `config.toml`.

The existing `local.path` configuration value cannot yet distinguish a remembered local checkout from an active local projection. `ki diag` prints only the path, while `ki doctor` confirms merely that a managed user skill is a symlink, not that it resolves to the expected source.

## Steps

1. Replace the path-taking activation grammar with `ki dev local set <local-harness-path>`, which validates and persists one physical local harness source without changing its active projection.
2. Make argument-free `ki dev local on` require that configured source, enable the canonical local payload projection, and re-point every recognised KI-managed core user-skill link to the already-validated local source on every run.
3. Make `ki dev local off` restore the verified canonical harness and re-point every managed core user-skill link to its installed canonical source while retaining the configured local path for a later `on`.
4. Preserve foreign filesystem entries and unfamiliar links as fail-closed errors. An idempotent `on` against the configured source must still reconcile every managed link rather than trusting a prior projection.
5. Extend `ki diag` to report whether local development is not configured, configured but off, or on, without treating link health as a diagnostic concern.
6. Extend `ki doctor` to validate active local-mode managed link targets and report missing, broken, or wrong-target links as failures; retain the existing canonical-harness checks while local mode is off.
7. Add black-box CLI contracts for set/on/off, stale-link reconciliation, canonical restoration, idempotent re-activation, diagnostic state, and doctor failures across every configured runtime.
8. Update root help, completions, `ki(1)`, and local-development guidance with the set/on/off lifecycle, then run the full type, CLI, coverage, and repository-governance gates.

## Files touched

- `src/commands/dev.ts`, `src/commands/diag.ts`, `src/commands/doctor.ts`, and command registration/completions
- focused agent configuration, bootstrap, and linking helpers required to preserve local-source state and managed-link ownership checks
- `src/tests/cli/dev.test.ts`, `src/tests/cli/diag.test.ts`, `src/tests/cli/doctor.test.ts`, and any shared CLI sandbox fixture needed to represent stale managed links safely
- `man/ki.1`, README, and `docs/developer/local-development.md`

## Verify

1. `bunx tsc --noEmit`
2. `bunx vitest run src/tests/cli/dev.test.ts src/tests/cli/diag.test.ts src/tests/cli/doctor.test.ts`
3. `bun run test:coverage`
4. `./bin/ki repo audit --repo .`
5. The CLI contract proves that `set` preserves a physical source without activation, `on` reconciles every configured runtime to it, `off` restores every one to the installed canonical source while preserving the saved source, and `diag` / `doctor` report mode and health accurately.

## Dependencies / blocks

CLI-011 has no blocking roadmap dependency. It transfers implementation evidence from `knowledgeislands/ki-agentic-harness@92d5b263` but remains owned and independently executable in `tools-ki`.

## Discussion

### Evidence

The mismatch was observed after the harness added `ki-implement`, `ki-accept`, and `ki-batch`, and updated `ki-recap`'s compaction boundary.

The canonical source was at `knowledgeislands/ki-agentic-harness@92d5b263`; `ki diag` showed that checkout as `Local source`, while both runtime links resolved to the older temporary payload and therefore exposed stale `ki-recap` content.

### Intended contract

`ki dev local set <path>` should validate and remember the physical local harness without changing active links.

`ki dev local on` should activate that remembered source and reconcile every KI-managed core user skill into each configured runtime.

`ki dev local off` should restore the verified canonical harness and every managed core user-skill link, while retaining the remembered local source for a later activation.

It should update the recorded managed-skill inventory from the current source, be safe to repeat, preserve foreign entries, and report the source actually linked.

### Verification shape

Use the existing black-box CLI sandbox contract.

Start from a managed old payload, enable local mode against a fixture harness containing the current core skill set, then assert that `ki diag`, `config.toml`, and every managed runtime link agree on the local source.

Repeat the command and assert idempotence.

### Diagnostic and health boundary

`ki diag` owns concise state reporting: no configured source, a configured source that is off, or an active local projection.

`ki doctor` owns link health. When local mode is on, it must compare every managed link's physical target to the expected local source and fail on an absent, dangling, or wrong-target link. When local mode is off, the same managed links must resolve to the verified canonical installed source.

### Direct promotion rationale

The observed stale runtime content is an active correctness issue in the development workflow, and the handoff identifies both its immediate failure mode and an executable black-box verification shape.

The implementation boundary is limited to the already-established canonical local harness and managed user-skill projection paths, so a Soon shaping stage would add no useful uncertainty.
