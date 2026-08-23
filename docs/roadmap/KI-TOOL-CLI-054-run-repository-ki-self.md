---
id: KI-TOOL-CLI-054
area: CLI
title: Run repository ki-self
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Enable every Knowledge Islands repository that authors a valid canonical `ki-self` source to run its repository-specific governance through native `ki repo audit` and `ki repo conform`, without weakening the verified-harness boundary for any other local skill.

## Context

The current host resolves executable operations only from registered installed harnesses. That is correct for portable capabilities, but conflicts with the established `ki-self` model: a repository may author one committed local skill at `.agents/skills/ki-self/`, which is explicitly not an installed-harness capability. `tools-ki` has such a source, but its Markdown rubric cannot presently execute through the native host.

The local-provider rule must apply to any KI repository, not only `tools-ki`. It must therefore be rooted in physical repository ownership and an explicit `ki-self` declaration rather than a repository identity allowlist.

## Boundary

This work permits only the exact canonical repository-local `ki-self` source. It does not introduce arbitrary local-skill execution, revive legacy shell runners, infer a local source from an undeclared directory, or make repository-local capabilities installable harness payloads.

## Current state

`resolveDeclaredSkills` selects only skills supplied by declared registered harnesses. The existing repository-local `ki-self` source in `tools-ki` states that native audit/conform is deferred, and it contains a prose rubric rather than the host's canonical `scripts/rubric/items/index.ts` catalogue. The generic guard therefore refuses it as designed.

## Steps

- [ ] Define a repository-local `ki-self` provider origin that remains distinct from an installed harness in resolution, reporting, and diagnostics.
- [ ] Require an explicit `[skills.ki-self]` declaration and one exact, physical, contained `.agents/skills/ki-self/` source with a validated native rubric catalogue.
- [ ] Host the local provider through the existing native audit and conform runtime without creating a general local-code execution fallback.
- [ ] Convert `tools-ki`'s canonical `ki-self` rubric into the validated executable catalogue shape and retain its generated publication.
- [ ] Add sandboxed CLI coverage showing the same valid local `ki-self` contract works for a non-`tools-ki` repository.
- [ ] Add negative coverage for missing declaration, missing catalogue, symbolic links, path escape, foreign local-skill names, and unchanged installed-harness resolution.
- [ ] Amend the living local-skill and native-operation decisions and their guidance to state the universal repository-local provider rule.
- [ ] Run type, test, coverage, focused repository, and skill audits before review.

## Files touched

- `src/core/configuration/`, `src/core/harness/`, `src/core/rubric/`, and repository-operation tests in `tools-ki`
- `.agents/skills/ki-self/` and its generated rubric publication in `tools-ki`
- `docs/decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md` in `tools-ki`
- the repository-local `ki-self` standard and its living decision in `ki-agentic-harness`

## Verify

- A fixture KI repository with a physical, declared canonical `ki-self` passes `ki repo audit --skill ki-self` and supports safe conform proposals.
- The host rejects every non-canonical or unsafe local source before importing its rubric code.
- A declared portable skill still requires a registered compatible harness; no other repository-local skill gains executable status.
- `bunx tsc --noEmit`, `bun run test:coverage`, focused `ki repo audit --skill ki-engineering`, and relevant `ki-skills` audits pass in affected repositories.

## Dependencies / blocks

The host implementation and the repository-local source convention must change together. Existing decisions are living records and should be amended in place where they own the installed-harness versus local-source distinction. No provider export, external service, or source-session access is required.

## Documentation impact

### Decision Records

Amend the existing native-operation and repository-local-skill decisions; a new decision record is not needed unless the current owners prove unrelated during implementation.

### Specifications

Update the relevant local-skill and operation contract when the executable boundary is proven; do not claim a portable rule before tests establish it.

### Guides

Add an operator-facing explanation of when a repository-local `ki-self` is executable and how it differs from an installed harness capability.

### Roadmap

This item owns the implementation sequence; no duplicate work item is needed.

## Discussion

### Local provider boundary

The host may execute repository-authored code only after it verifies the repository root, explicit declaration, canonical source path, physical containment, and catalogue structure. This is a deliberately narrow opt-in for `ki-self`; the host must not search arbitrary directories or use a repository's name as permission.

### Capability provenance

Installed harness capabilities remain immutable, verified, and portable. A repository-local `ki-self` is mutable with the repository, applies only to that repository, and must be reported as such. Keeping the origins separate preserves both the local governance use case and the installed-harness trust boundary.
