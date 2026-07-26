---
id: 'CLI-004'
title: Deliver native repository maintenance through registered skills
status: in-progress
roadmap: cli/deliver-native-repository-maintenance-through-registered-skills
blocks: —
blocked-by: —
baseline-ref: 99e714d5084cd58e026daaf70086efd006177478
---

## Context

`ki repo educate`, `ki repo audit`, and `ki repo conform` must become direct Bun capabilities. `ki` resolves capabilities declared in the selected repository's `.ki-config.toml`, and installed compatible harnesses run their rubrics through one `tools-ki`-owned governed-rubric runtime, without spawning legacy vendored scripts or requiring the repository to carry `.ki/bin` runners.

[ADR-KI-TOOLS-001](../../decisions/ADR-KI-TOOLS-001-typescript-native-command-host.md) adopts the native Bun TypeScript host this work builds on. [ADR-KI-TOOLS-002](../../decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md) defines the registry, command, and scope boundary for native operations. [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) (owned by `ki-agentic-harness`) defines compatible-harness, capability, projection, and CI-trust boundary; this plan does not transfer ownership of that architecture, release, or delivery decision.

## Current state

### Delivered

- Installed-harness acquisition and verification: read-only `ki harness list`, XDG-located installed-harness discovery, immutable archive-evidence checks ahead of extraction.
- Capability activation at explicit user or repository scope, including the five core user skills (`ki-bootstrap`, `ki-delegate`, `ki-next`, `ki-plan`, `ki-recap`) and `ki dev on`/`ki dev off` for canonical-payload development links.
- `.ki-config.toml` resolution: declared skill tables parsed and resolved only against installed harnesses, with declared dependencies ordered before execution.
- `ki repo educate`, `ki repo audit`, and `ki repo conform` supersede the legacy `.mjs`-runner model: educate renders the validated static rubric catalogue without executing it; audit and conform provide fixture-backed in-process execution, transactional dry-run, guarded publication, and post-conform re-audit.
- CLI-005's contract-test lock and 100% coverage safety net across the command surface, closing out the prior tranche this plan builds on.
- T1.1 + T1.2 — versioned TypeScript rubric contract and governed runtime (commit `148fe6f`).
- T1.4 — vendored shared-module link materialisation at acquisition (commit `e2b82ce`).

## Steps

### Tranche T1 — tools-ki bulk move (execution guidance)

`tools-ki`-owned tranche handoff: versioned rubric-definition contract, generic host runtime, fixture package. T1.1–T1.3 and T1.2a are committed, so Codex may begin the first harness definition conversion; the canonical `ki dev on` proof remains gated on a regular-file harness development payload. Constraints are in the [incoming handoff](../../../../+/_HANDOFFS/ki-agentic-harness/CLI-004-compatible-harness-operation-constraints.md); harness inventory measured the generic engine at ~1,561 non-test lines (`rubric.ts` 156, `checker.ts` 594, `govern.ts` 180, `reporter.ts` 262, plus legacy `checker-reporter.ts` deliberately not ported).

Contract decisions locked at T1.1:

- One versioned TypeScript module per installed skill at `scripts/rubric/index.ts`, default-exporting a `SkillRubricDefinition` (`contract: 1`), structurally validated at load; no `.mjs` operations, per-skill runner, or second wrapper convention survives.
- The runtime imports that TypeScript as it stands, via Bun — no compile, transpile, or bundle step anywhere in the path — from the installed payload or the `ki dev on`-linked checkout.
- Reporter, progress, and JSONL presentation are host-owned `ki` functionality; skills declare outcomes only and never render.
- The definition model adapts the harness catalogue (phases `PREPARE`/`INSPECT`/`PRIMARY`/`DERIVED`/`NORMALISE`; levels `FAIL`/`WARN`; audit outcomes `PASS`/`VIOLATION`/`NOT_APPLICABLE`/`INFO`) with judgment items as never-executed catalogue data. Conform actions declare serialisable `ConformWrite` proposals consumed by the host transaction; `FIXED` derives from the post-publication re-audit; skills never see a write path or a dry-run flag.

| Unit | Scope | Model / effort | Status |
| --- | --- | --- | --- |
| T1.1 Contract | `src/core/rubric.ts` versioned types + loading convention (above) | Fable (main loop) | done |
| T1.2 Runtime | Loader (contained Bun import), audit executor, host-owned conform transaction, rendering; replace `.mjs` operations, migrate CLI test fixtures | Sonnet 5 / high | done |
| T1.2a Transaction identity guard | Snapshot each conform target's regular-file identity and physical containment at preparation; revalidate identity as well as bytes before publication and before rollback. Prove same-byte inode replacement and rollback-target replacement are refused without overwriting the replacement. | Sonnet 5 / medium | done |
| T1.3 Acceptance fixtures | Handoff's acceptance-evidence list as CLI tests: contained loading, dependency order, malformed/linked/altered/unavailable/duplicate providers, byte-identical dry run, concurrent-replacement refusal, rollback, re-audit | Sonnet 5 / medium | done |
| T1.4 Nested-link materialisation | Step 5.4: materialise shared-module links as regular verified files at acquisition; never weaken or follow nested-link validation. This protects acquired payloads only, not a raw `ki dev on` checkout. | Sonnet 5 / medium | done |
| T1.5 Proof against canonical payload | Steps 7.4/8.4 first passes + step 9.1 first clause via `ki dev on` linked harness | Sonnet 5 / medium | done — `ki-handoffs` ran from the canonical development payload: audit, byte-identical dry run, host-owned conform, and post-conform re-audit |
| T1.6 Surface alignment | Step 10 residuals touched by above | Haiku 4.5 / low | done — `ki repo educate`, `audit`, and `conform` render an interactive TTY progress bar while non-interactive output remains stable |
| T1.7 Generic rubric publication | `ki skill rubric <name> [--write]`: drift check by default, publication only through a dev-linked payload; replaces every per-skill `scripts/rubric/publish.ts` | Sonnet 5 / medium | done (`65d288e`) |
| T1.8 Bounded subprocess conforms | Versioned conform commands declared by a native rubric; `ki` validates, reports, dry-runs, runs from the resolved repository without a shell, and re-audits. This enables honest migration of the authoring and engineering tool gates without reviving per-skill wrappers. | Codex / high | done (`4ca4ff3`) |

Orchestration: Fable coordinates, designs T1.1, reviews diffs, and runs gates (`bun run test` at 100% thresholds, tsc, biome, knip) before unit commits; sub-agents implement. T1.2 and T1.4 ran in parallel (disjoint files); T1.3 follows T1.2.

## Files touched

- `src/`, `bin/ki`, installer, completion, tests, build artefacts, CI
- Native core, command catalogue, registered-operation modules
- CLI guide, README, changelog, roadmap material
- Migration fixtures for user-install/runtime

## Verify

1. The tools test suite, TypeScript check, Biome, Knip, and roadmap audit pass after each T1 unit.
2. T1.2a proves a same-byte replacement and a replacement during rollback both survive untouched; conform fails closed before overwriting either target.
3. T1.5 proves the converted canonical harness from a dev-linked regular-file payload, including audit, byte-identical dry run, conform, and post-conform re-audit.
4. The first consumer conversion demonstrates that a skill only supplies read-only evidence and serialisable conform proposals; the host owns every write and presentation surface.

## Dependencies / blocks

Former harness outbound handoffs are adopted rather than retained as a parallel specification. Harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) is an external architecture prerequisite; it does not transfer ownership of `tools-ki`'s implementation, release, or delivery decision.
