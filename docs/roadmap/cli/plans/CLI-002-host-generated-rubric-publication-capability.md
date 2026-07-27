---
id: 'CLI-002'
title: Host generated rubric-publication capability
status: in-progress
roadmap: cli/host-generated-rubric-publication-capability
blocks: —
blocked-by: —
baseline-ref: 3c8b27127ea46ebacef3cb74dbcc4b3f7149f128
transferred-from: knowledgeislands/ki-agentic-harness:FND-002
---

## Context

The harness plan [FND-002](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-002-protect-generated-rubric-publications.md) makes each structured skill catalogue authoritative and its `references/rubric.md` publication derived.

This CLI plan delivers the host half of that contract.

`tools-ki` must expose validated rendered-publication evidence and guarded incremental publication mechanics to a capability's rubric context without becoming the owner of a `ki-skills` criterion or finding.

## Current state

- `src/core/rubric-render.ts` already renders a structured catalogue, and `ki skill rubric <skill>` detects missing or stale `references/rubric.md` output.
- That standalone writer is outside repository CONFORM, so it cannot share the host's validated target checks, deterministic write ordering, re-audit, or FIXED reporting.
- The rubric context contract has no injected capability for `ki-skills` to receive canonical publication bytes and propose a derived write.
- The received harness plan is already in progress; its policy and catalogue changes must not start until this CLI plan settles the host interface and mechanics.

## Steps

1. ✓ Freeze a narrow, typed host-injected publication capability: validated catalogue identity, canonical rendered bytes, tracked-target state, and a derived write proposal with deterministic failure semantics.
2. ✓ Route standalone `ki skill rubric` inspection and repository publication preparation through the same validated loading and rendering path, without parsing generated Markdown or adding a second renderer.
3. Replace cross-file direct-write transactions with guarded incremental publication: physical containment, scope and symlink refusal, concurrent-change refusal, atomic per-file replacement, deterministic order, retained earlier successes on a later failure, and truthful re-audit/reporting.
4. ✓ Inject only publication evidence and a host-owned derived-write mechanism into rubric contexts; do not create a host-side automatic finding, encode a `KI-CHECKER-6` identity, or weaken installed-harness validation.
5. Add CLI-contract coverage for clean, missing, stale, malformed, symlink, dry-run, repeated conform, ordered multi-write failure, concurrent replacement refusal, retained earlier successes, accurate remaining findings, FIXED reporting, and standalone/repository byte parity.
6. Hand the frozen capability contract and verification evidence back to the harness so [FND-002](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-002-protect-generated-rubric-publications.md) can add `ki-skills` policy and regenerate its derived publications.

## Files touched

- `src/core/rubric-render.ts`, `src/core/transaction.ts`, and focused rubric/session/repository-operation modules
- `src/commands/skill.ts` and repository-operation host modules where the injected capability is composed
- `src/tests/cli/` contract coverage for standalone rubric and repository audit/conform paths
- `docs/roadmap/cli/ROADMAP.md`
- `docs/roadmap/cli/plans/CLI-002-host-generated-rubric-publication-capability.md`

## Verify

1. `bun run test` and `bun run test:coverage` pass with the repository's required 100% coverage thresholds.
2. `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, and `git diff --check` pass.
3. The same valid catalogue produces byte-identical standalone and repository publication output, including final newline and generated-source notice.
4. `ki repo audit --skill ki-skills --repo <fixture>` reports publication drift only when the harness policy consumes the injected evidence; the CLI itself emits no rubric-criterion finding.
5. `ki repo conform --skill ki-skills --repo <fixture> --dry-run` reports the derived write without changing files; real CONFORM publishes each safe write atomically in deterministic order; and a repeated dry-run proposes no publication write.
6. Malformed catalogues, unsafe targets, and concurrent replacement are refused before their write; after an unexpected later write failure, earlier successful writes remain and the command reports the failure and re-audited remaining state without rollback.

## Dependencies / blocks

This plan is the receiving-repository implementation half of `knowledgeislands/ki-agentic-harness:FND-002` and blocks that plan's host-injected context and `KI-CHECKER-6` implementation.

The cross-repository relationship is recorded as `transferred-from` rather than a local `blocked-by` identifier because roadmap dependency fields resolve only plans in this repository.

The existing renderer and transaction framework are implementation prerequisites, not blockers.

No compatibility path, generated-Markdown parser, duplicate renderer, host-created automatic finding, relaxed installed-harness validation, or cross-file rollback is permitted.

## Delegation

- Round 1 — judgment: freeze the typed publication capability and error semantics across the standalone and repository paths; files: read-only `src/core/`, `src/commands/`, and harness `ki-skills` contract scope; gate: an interface review accepted by both repository owners.
- Round 2 — mechanical: implement host loading, guarded incremental publication, context injection, and CLI-contract tests; files: exclusive `tools-ki/src/**`; gate: focused standalone, audit, conform, retained-success, and parity tests.
- Round 3 — mechanical: consume the frozen interface in harness `ki-skills`, regenerate publications, and verify cross-repository integration; files: exclusive harness scope; gate: both repositories' full verification suites.
- Orchestrator: review every worker diff, ensure host mechanics remain criterion-agnostic, run final verification, and commit only gated work.
