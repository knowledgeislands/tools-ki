---
id: KI-TOOL-CLI-054
area: CLI
title: Run repository ki-self
theme: cli
horizon: next
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 0ff99aca76fa7e7b900cd53e3e3fffdf8026116d
---

## Goal

Enable every Knowledge Islands repository that authors a valid canonical `ki-self` source to run its repository-specific governance through native `ki repo audit` and `ki repo conform`, without weakening the verified-harness boundary for any other local skill.

## Context

The current host resolves executable operations only from registered installed harnesses. That is correct for portable capabilities, but conflicts with the established `ki-self` model: a repository may author one committed local skill at `.agents/skills/ki-self/`, which is explicitly not an installed-harness capability. `tools-ki` has such a source, but its Markdown rubric cannot presently execute through the native host.

The local-provider rule must apply to any KI repository, not only `tools-ki`. It must therefore be rooted in physical repository ownership and an explicit `ki-self` declaration rather than a repository identity allowlist.

## Boundary

This work permits only the exact canonical repository-local `ki-self` source. It does not introduce arbitrary local-skill execution, revive legacy shell runners, infer a local source from an undeclared directory, or make repository-local capabilities installable harness payloads.

## Current state

`resolveDeclaredSkills` is synchronous and binds every declaration to an `InstalledHarness`; `ResolvedSkill`, rubric loading, publication, repository projection diagnostics, and repository upgrade all consequently assume `skill.harness`. Repository-operation selection already owns a physically resolved repository root, but does not pass that authority into capability resolution.

`tools-ki` does not yet declare `[skills.ki-self]`. Its canonical `.agents/skills/ki-self/` source contains only `SKILL.md` and a prose rubric, whose final judgment note still defers native execution to a now-completed handoff. The host therefore refuses the undeclared, unprovided skill as designed, and there is no executable catalogue to load.

## Steps

- [ ] Replace the installed-harness-only `ResolvedSkill` shape with an explicit installed-harness or repository-local provider origin, retaining one shared capability contract and deterministic dependency ordering while reporting the local identity as `repository-local:ki-self`.
- [ ] Add a repository-local provider inspector at repository-operation selection. It activates only for an explicit `[skills.ki-self]` declaration, resolves only `.agents/skills/ki-self/` below the already physical repository root, and rejects missing, linked, non-directory, escaping, wrongly named, or catalogue-less sources before import.
- [ ] Adapt rubric loading and generated publication to consume the resolved provider root rather than an assumed Harness root. Keep the existing catalogue validator and repository-scoped conform transaction as the only execution and write path.
- [ ] Keep installed-provider consumers honest: repository projection health and repair must not invent a managed projection for the canonical local source, while repository upgrade must refresh only installed Harness origins and diagnostics must label the local origin distinctly.
- [ ] Convert `tools-ki`'s `ki-self` prose rubric into the canonical `scripts/rubric/items/index.ts` catalogue and supporting context/item modules, declare `[skills.ki-self]`, regenerate `references/rubric.md`, and remove the obsolete native-execution deferral from `SKILL.md`.
- [ ] Add a sandbox helper for repository-local skill sources and CLI contract coverage proving that a non-`tools-ki` fixture can audit and safely conform its declared physical `ki-self`, including generated-publication writes inside that repository.
- [ ] Add fail-closed CLI coverage for an absent declaration, absent source or catalogue, a linked source or catalogue, physical escape, a mismatched or foreign local skill name, an installed Harness declaration that remains unresolved, and local-provider exclusion from projection repair and Harness upgrade.
- [ ] Amend the `tools-ki` native-operation decision, add the as-built local-provider requirement to the repository-operations specification, and document how repository-local governance differs from installed Harness development and managed runtime projection.
- [ ] With explicit cross-repository write authority, amend the Harness's repository-local source standard, direct-rubric shape criterion and tests/publication, local-skill and governed-rubric decisions, and testing guidance so the portable source contract and host implementation land together.
- [ ] Run targeted repository-operation tests during implementation, then the full type, Biome, coverage, focused governance, and affected Harness gates before review.

## Files touched

- Provider and execution seams: `src/core/configuration/resolution.ts`, `src/core/repository/operations/selection.ts`, `src/core/rubric/loader.ts`, `src/core/rubric/publication.ts`, and their barrels or one focused provider-inspection module.
- Installed-provider consumers: `src/core/repository/operations/local-state.ts`, `src/commands/repo/repository-health.ts`, `src/commands/repo/upgrade.ts`, and their CLI tests.
- Local governance source: `.ki-config.toml` and `.agents/skills/ki-self/`, including its catalogue modules and generated `references/rubric.md`.
- CLI fixtures and contracts: `src/tests/cli/_cli_helper.ts`, a focused repository-local-provider test file, and only the existing resolution, diagnostic, repair, or upgrade suites whose public contracts change.
- `tools-ki` documentation: `docs/decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md`, `docs/specs/repository-operations.md`, `docs/guides/README.md`, and one focused repository-local-governance guide.
- With separate authority in `ki-agentic-harness`: `skills/keystone/ki-repo/references/standards-repository.md`; `skills/keystone/ki-skills/scripts/rubric/items/ki-shape.ts`, its context tests, and generated rubric; `ADR-KI-HARNESS-011`, `ADR-KI-HARNESS-012`, and the relevant developer testing guide.

## Verify

- `bunx vitest run` over the focused local-provider, resolution, diagnostic, repair, and upgrade CLI suites passes through `run(args, context)` and the sandbox HOME/XDG boundary.
- A fixture repository with an explicit `[skills.ki-self]` and physical canonical source passes `ki repo audit --skill ki-self`; `ki repo conform --skill ki-self` publishes only proposed repository-relative changes and re-audits them.
- Every unsafe-source fixture fails before its catalogue's observable import sentinel can run; declaring any other repository-local skill still reports that no declared installed Harness provides it.
- Diagnostics render `repository-local:ki-self` without a missing managed projection, and `ki repo upgrade` neither treats it as a Harness nor suppresses upgrades for installed providers in the same repository.
- `bunx tsc --noEmit`, `bunx biome check`, and `bun run test:coverage` pass in `tools-ki`; `ki repo audit --skill ki-engineering`, `ki repo audit --skill ki-self`, and the affected documentation-governance audits pass.
- The affected Harness catalogue tests and generated-publication check pass, followed by its full required gate and focused `ki-repo` and `ki-skills` audits.

## Dependencies / blocks

No local roadmap item or external service blocks the implementation. The host implementation and portable repository-local source convention must change together, however, and this repository's authority contract makes `ki-agentic-harness` read-only until the user explicitly approves that exact cross-repository write scope. Readiness therefore requires approval of both this plan and the named Harness edits; no commit or push is implied.

## Documentation impact

### Decision Records

Amend `ADR-KI-TOOLS-002` for the exceptional local provider. In the Harness, amend `ADR-KI-HARNESS-011` for repository-local source ownership and `ADR-KI-HARNESS-012` for its narrow governed-rubric exception; no new decision record is needed.

### Specifications

Append one requirement to `docs/specs/repository-operations.md` after the CLI tests prove the provider selection, fail-closed import boundary, provenance, and installed-provider exclusion. Do not broaden the user-skill activation contract.

### Guides

Add one focused `tools-ki` guide explaining declaration, canonical source shape, native audit/conform, provenance, and the difference from installed Harness local development. Amend the Harness testing guide only for the portable source-author verification workflow.

### Roadmap

This item owns the implementation sequence; no duplicate work item is needed.

## Discussion

### Local provider boundary

The host may execute repository-authored code only after it verifies the repository root, explicit declaration, canonical source path, physical containment, exact `ki-self` identity, and catalogue presence. Catalogue shape remains validated by the same loader after import. This is a deliberately narrow opt-in for `ki-self`; the host must not search arbitrary directories, accept a caller-supplied source, or use a repository's identity as permission.

### Capability provenance

Installed harness capabilities remain immutable, verified, and portable. A repository-local `ki-self` is mutable with the repository, applies only to that repository, and must be reported as such. Keeping the origins separate preserves both the local governance use case and the installed-harness trust boundary.

The local source is already the canonical Codex discovery source, with any Claude link governed separately as a derived runtime projection. Native repository operations therefore consume it directly without activating, repairing, or upgrading it as an installed Harness payload.
