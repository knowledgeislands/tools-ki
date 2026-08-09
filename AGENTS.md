# AGENTS.md — tools-ki

This is the runtime-neutral working convention for the Knowledge Islands CLI. The README is the entry point for user-facing purpose, installation, and roadmap detail.

## Engineering conventions

These govern all work in this repo.

- **Style** — arrow functions throughout; no classes; strong typing via `interface`/`type`; small, well-named functions over cleverness. Modules stay focused: when a file accumulates unrelated concerns, split it behind a barrel rather than letting it grow.
- **Test the contract, not the units** — the API is the CLI. Every test drives the in-process seam `run(args, context)` via the `sandbox()` helper (`src/tests/cli/_cli_helper.ts`), asserting stdout, exit code, and on-disk effects on the sandbox's throwaway HOME/XDG quartet. No unit tests of internal functions — they ossify internals and block refactoring.
- **A scripted fixture migration needs a scope predicate, not just a pattern** — the suite holds hundreds of inline configuration fixtures, and two different schemas share spellings: a repository `.ki-config.toml` and the user `ki/config.toml` both use `[skills.<name>]` tables. A regex broad enough to catch every fixture of one kind will silently rewrite the other kind and the assertion strings that quote them, and the damage surfaces as unrelated failures several steps later. Scope a bulk rewrite by what the literal _is_ — the call site that writes it, or the file it is written to — never by the shape of its contents alone, and read the resulting diff for the other schema before running the suite.
- **Capabilities are injected through `KiContext`** — streams, paths, and the network `fetcher` all arrive on the context; never default a capability deep in core where tests cannot reach it. Tests stub capabilities at the same boundary the CLI receives them.
- **No network in tests** — the sandbox fetcher fails loudly unless a test stubs it; harness acquisition is tested end-to-end against fixture archives from `src/tests/cli/_archive_helper.ts`.
- **Coverage is a dead-code detector** — `bun run test:coverage` enforces 100% thresholds on all four metrics over product code (`src/tests/**` excluded); plain `bun run test` runs the suite without coverage, so it is not the gate. A reachable-but-uncovered span gets a CLI test; an unreachable one is deleted — except a future-proofing guard, which may stay under a `/* v8 ignore */` carrying a justification comment stating why no CLI input can reach it (existing examples: `src/cli.ts`, `src/core/resolution.ts`, `src/commands/acquire.ts`). A justification that rests on an upstream guarantee must hold for **every** caller of the function it sits in, not the one that prompted it — check the full call list before writing it, and again when a new caller is added. A guard reached through a second caller that validates its arguments independently is reachable, and the pragma then hides a real gap instead of documenting an impossible one.
- **Fault injection stays at the interface** — a degenerate context or stub-fetcher bad bytes is preferred; `vi.mock` of `node:fs/promises` is a last resort, documented at the use site, wrapped around a CLI-driven invocation. Sanctioned instances: the transaction write-failure test in `src/tests/cli/acquire.test.ts` and the concurrent-replacement/rollback acceptance tests in `src/tests/cli/transaction.test.ts` — both provoke transaction guards unreachable from a single in-process CLI invocation.
- **No legacy shims** — make the contract correct for the current state and migrate every footprint to it; no compatibility fallbacks or dual paths unless a transition period is explicitly requested.
- **Release verification** — packaging runs the functional suite on each target; coverage remains a CI engineering gate, not a release-publishing gate. A release is complete only after immutable publication and the workflow's clean-install proof succeed.
- **Verify a portable claim against its specification** — when an assertion about a format, protocol, or standard leaves this repository, particularly in a trade, check it against that standard rather than against the parser or library that happens to implement it here. A permissive implementation reads as agreement and a strict one reads as prohibition, and neither is evidence about the standard. `smol-toml` accepting a construction says nothing about whether TOML permits it. The same trap runs the other way, in what a parser can be asked to enforce: where the grammar makes two constructions indistinguishable after parsing, `ki` states the rule and does not pretend to check it. `[skills.ki-repo-trades.routes]` implicitly creates `skills.ki-repo-trades`, so an explicitly declared root table and an omitted one parse identically — the standard requires the explicit declaration, and the parser accepts both rather than inventing a text-level check the format does not support.
- **Compare a portable artefact by its parsed meaning, not its bytes** — a record that crosses a repository boundary passes through the receiver's formatter, so frontmatter quoting, blank lines, and trailing whitespace all differ without anything of substance having changed. Any equality or immutability check over such an artefact compares parsed field values and trimmed prose; a byte comparison reports tampering for ordinary Markdown hygiene and blocks the lifecycle it was meant to protect. `senderPayloadProjection` in `src/core/trade-core.ts` is the worked example.

## Progress and commits

- Give concise progress updates at meaningful checkpoints and at least every few minutes during sustained work.
- Commit only a completed, verified unit of work. Stage explicit paths for that unit and do not combine it with unrelated working-tree changes.
- If a unit cannot yet be verified, report the checkpoint and leave it uncommitted until its verification is complete.
- **Attribute state before blaming it on the tree.** More than one session may hold this checkout at once, so a failing test, a reformatted file, or a reverted record is not evidence about `HEAD` until it has been attributed. Establish which commit introduced a failure with `git log` or a bisect against a specific commit rather than inferring it from the working tree, and never use `git stash` or `git checkout --` to probe a question while uncommitted work is present: both discard whatever a concurrent session is holding, and `git checkout --` will silently take your own uncommitted edits with it. Commit first, then probe.
- **Re-check a repository fact before asserting it again.** The same discipline applies to any state carried forward in conversation, not just to a failure: how many commits are unpushed, whether a gate passed, whether a file is dirty. A number remembered from earlier in a session and incremented by reasoning is a guess wearing the costume of a measurement, and it will be believed. Re-run `git rev-list --left-right --count origin/main...HEAD`, `git status --porcelain`, or the gate itself, and quote what it returned.

## Cross-repository choreography

- Arcadia Principal, the KI Agentic Harness, `tools-ki`, KI Specifications, and the KI Website may add a concrete handoff item to one another's Stream or roadmap. The receiving repository owns its priority, plan, and execution.
- Record the originating repository and item, then state whether the handoff `blocks` or is `blocked by` the local item. Keep the relationship reciprocal where both items exist.
- Prefer independently executable, non-blocking work. Mark an item as blocking only when it is a genuine prerequisite; otherwise let the receiving repository schedule it in its own horizon.

## Cross-repository authority

This temporary local rule must be removed when `ki-repo` defines the same default behaviour for KI repositories.

- Work in `tools-ki` may be read, written, and committed as part of an authorised task.
- Other repositories are read-only by default. Request explicit chat approval before writing there, and do not commit there unless the user expressly approves that exact commit after its target and scope are clear.
- An outbound trade is authored and committed only in this repository. It does not grant permission to write a receiver copy, alter the receiver's configuration, or make a decision on its behalf.

## CLI platform authority

- `tools-ki` owns the public `ki` executable, its release artifacts, harness installation, repository resolution, scoped activation, and registered native-operation host.
- Compatible harnesses own their skills and semantics; KI Specifications owns portable normative contracts.
