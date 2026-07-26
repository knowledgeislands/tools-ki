# AGENTS.md — tools-ki

This is the runtime-neutral working convention for the Knowledge Islands CLI. The README is the entry point for user-facing purpose, installation, and roadmap detail.

## Engineering conventions

These govern all work in this repo.

- **Style** — arrow functions throughout; no classes; strong typing via `interface`/`type`; small, well-named functions over cleverness. Modules stay focused: when a file accumulates unrelated concerns, split it behind a barrel rather than letting it grow.
- **Test the contract, not the units** — the API is the CLI. Every test drives the in-process seam `run(args, context)` via the `sandbox()` helper (`src/tests/cli/_cli_helper.ts`), asserting stdout, exit code, and on-disk effects on the sandbox's throwaway HOME/XDG quartet. No unit tests of internal functions — they ossify internals and block refactoring.
- **Capabilities are injected through `KiContext`** — streams, paths, and the network `fetcher` all arrive on the context; never default a capability deep in core where tests cannot reach it. Tests stub capabilities at the same boundary the CLI receives them.
- **No network in tests** — the sandbox fetcher fails loudly unless a test stubs it; harness acquisition is tested end-to-end against fixture archives from `src/tests/cli/_archive_helper.ts`.
- **Coverage is a dead-code detector** — `bun run test` enforces 100% thresholds on all four metrics over product code (`src/tests/**` excluded). A reachable-but-uncovered span gets a CLI test; an unreachable one is deleted — except a future-proofing guard, which may stay under a `/* v8 ignore */` carrying a justification comment stating why no CLI input can reach it (existing examples: `src/cli.ts`, `src/core/resolution.ts`, `src/commands/acquire.ts`).
- **Fault injection stays at the interface** — a degenerate context or stub-fetcher bad bytes is preferred; `vi.mock` of `node:fs/promises` is a last resort, documented at the use site, wrapped around a CLI-driven invocation. Sanctioned instances: the transaction write-failure test in `src/tests/cli/acquire.test.ts` and the concurrent-replacement/rollback acceptance tests in `src/tests/cli/transaction.test.ts` — both provoke transaction guards unreachable from a single in-process CLI invocation.
- **No legacy shims** — make the contract correct for the current state and migrate every footprint to it; no compatibility fallbacks or dual paths unless a transition period is explicitly requested.

## Progress and commits

- Give concise progress updates at meaningful checkpoints and at least every few minutes during sustained work.
- Commit only a completed, verified unit of work. Stage explicit paths for that unit and do not combine it with unrelated working-tree changes.
- If a unit cannot yet be verified, report the checkpoint and leave it uncommitted until its verification is complete.

## Cross-repository choreography

- Arcadia Principal, the KI Agentic Harness, `tools-ki`, KI Specifications, and the KI Website may add a concrete handoff item to one another's Stream or roadmap. The receiving repository owns its priority, plan, and execution.
- Record the originating repository and item, then state whether the handoff `blocks` or is `blocked by` the local item. Keep the relationship reciprocal where both items exist.
- Prefer independently executable, non-blocking work. Mark an item as blocking only when it is a genuine prerequisite; otherwise let the receiving repository schedule it in its own horizon.

## CLI platform authority

- `tools-ki` owns the public `ki` executable, its release artifacts, harness installation, repository resolution, scoped activation, and registered native-operation host.
- Compatible harnesses own their skills and semantics; KI Specifications owns portable normative contracts.
