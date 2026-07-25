---
id: 'CLI-005'
title: Lock the CLI contract with end-to-end tests, then simplify internals
status: open
roadmap: cli/lock-the-cli-contract-then-simplify-internals
blocks: —
blocked-by: —
---

## Context

`tools-ki` is the `ki` CLI; its external contract is the CLI itself. Complexity has concentrated in a few god-modules — `src/agents/index.ts` is 665 lines mixing five concerns (config schema render/read/inspect, agent detection, user-skill linking, repo-skill linking, bootstrap orchestration) and `src/core/registry.ts` is 422 (tar parse + acquire). The recently added `skill` command (`src/commands/skill.ts`) has zero end-to-end CLI tests, and `dev off` / `harness install` are also uncovered end-to-end. The goal is a codebase that is simple to comprehend, reached without changing behaviour blind: lock the CLI contract with tests first, then simplify the internals behind it, using coverage to expose dead or over-complex paths.

## Principles

- **Style** — arrow functions throughout; no classes (especially in TS); strong typing via `interface`/`type`; small, well-named functions over cleverness.
- **Test the contract, not the units** — the API is the CLI. Drive it end-to-end in-process through the existing seam `runKi(args, env)` → `createContext(...)` → `run(args, context)` (`src/cli.test.ts:63-88`), asserting stdout and exit code. Do not unit-test internal functions — that ossifies internals and blocks refactoring.
- **Real temp FS for effects** — `mkdtemp` + `HOME`/`XDG_CONFIG_HOME`/`XDG_DATA_HOME` env vars land symlinks, `config.toml`, and `.ki-config.toml` in a throwaway tree that is directly observable (`lstat`/`realpath`). Mock only for fault injection (the `vi.mock('node:fs/promises')` writeFile-failure pattern, `src/cli.test.ts:12-23`).
- **Mock only the acquire/download** — a pure read; the seam already exists (`installHarness(..., fetcher: Fetcher = fetch)`, `src/core/registry.ts:263`) with a local `gzipSync` tarball fixture (`src/core/registry.test.ts:56`).
- **Coverage as a dead-code detector** — full CLI-surface coverage means any reachable-but-uncovered code is a simplification or deletion candidate.
- **No behaviour change during simplification** — the Phase 1 contract tests stay green and unchanged through all of Phase 2.

## Current state

- Broad end-to-end CLI coverage exists via `runKi` + a real temp FS, but the `skill` command has no CLI test; `dev off` and `harness install` are also uncovered end-to-end.
- The acquire/download seam is dependency-injected (`fetcher`), but `ki harness install` through the CLI still defaults to the real `fetch`.

## Steps

1. [ ] **Phase 1 — `skill` contract tests.** Add end-to-end `runKi` tests for `ki skill user add|remove` and `ki skill repo add|remove`: assert the symlinks land in the temp `~/.claude/skills` / `~/.agents/skills` and repo `.claude/skills` / `.agents/skills`, the `config.toml` per-skill tables and `.ki-config.toml` `[<skill>]` tables are written, and the not-KI-managed / foreign-file guards fire. _Verify:_ new tests pass under `bun run test`.
2. [ ] **Phase 1 — remaining uncovered commands.** Add end-to-end tests for `dev off` and `harness install <id>`. For `harness install`, add a test-only fetcher override reachable from the CLI (env-gated or hidden option) so the download command is testable against a local tarball; optionally one opt-in networked smoke test. _Verify:_ both commands exercised end-to-end; no network in the default run.
3. [ ] **Phase 1 — coverage baseline.** Turn on coverage in the vitest run; record the baseline and list every reachable-but-uncovered span as a Phase 2 dead-code candidate. _Verify:_ coverage report produced; candidate list captured.
4. [ ] **Phase 2 — split `agents/index.ts`.** Split the 665-line module into cohesive, arrow-function, well-typed modules along its five seams (config schema, agents, skills-linking, bootstrap). _Verify:_ Phase 1 contract tests unchanged and green; tsc/biome/knip clean.
5. [ ] **Phase 2 — collapse duplicate link functions.** Unify `installManagedUserSkill`/`installManagedRepoSkill` and `addUserSkill`/`addRepoSkill` behind one typed `linkManagedSkill(skillsDir, skill, ...)` primitive parameterised by target dir (`agentSkillDirectory(agent, scope, repo)` already resolves the dir). _Verify:_ contract tests green; duplication removed.
6. [ ] **Phase 2 — registry review and dead-code removal.** Separate tar parsing from acquire/verify in `registry.ts`; delete the paths surfaced dead by the Phase 1 coverage run, noting anything intentionally kept. _Verify:_ no unreached CLI-reachable code; contract tests green.
7. [ ] **Phase 3 — recap.** Run `ki-recap` over the whole set of changes to harvest lessons and route them to their homes. _Verify:_ recap produced; lessons filed.

## Files touched

- `src/cli.test.ts` — Phase 1 CLI-surface tests (reuse `runKi`, `installBootstrapHarness`, `gzipSync` fixture, `vi.mock` fault seam).
- `src/commands/skill.ts` — Phase 1 test target; possibly a fetcher-override seam for `harness install`.
- `src/agents/index.ts` — Phase 2 split; `src/core/registry.ts` — acquire seam and Phase 2 review.
- `src/core/context.ts` — the in-process test entry seam (referenced, not changed).

## Verify

- `bun run test` (vitest) green with coverage on; `bunx tsc --noEmit`, `bunx @biomejs/biome check`, and `bun run knip` clean.
- The Phase 1 contract tests remain byte-unchanged across the entire Phase 2 refactor.
- Manually: `ki skill user add <skill>` against a temp HOME, then `lstat` the resulting symlink.

## Dependencies / blocks

None. Independent of the in-flight config/doctor work; it touches the `skill` command and `agents`/`registry` internals behind a locked contract.
