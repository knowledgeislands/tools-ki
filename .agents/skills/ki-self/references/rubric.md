# KI Self rubric

This rubric governs the repository-local `ki-self` source and the `tools-ki` host conditions it owns. It is deliberately narrower than [AGENTS.md](../../../../AGENTS.md): contribution practices remain there; these criteria provide durable, reviewable product governance.

## Classification

### SELF-CLASS-001 — Bootstrap inventory

The bootstrap user-skill inventory has one named, typed authority.

Evidence: `minimumBootstrapUserSkills` in `src/agents/internal.ts`.

### SELF-CLASS-002 — Managed-skill categories

A bootstrap skill is a required user-scope starting capability; a configured skill is every persisted managed identity; a resolved source is the capability selected for one identity; and a projection is the corresponding agent-runtime link. Do not collapse these classifications.

Evidence: `src/agents/bootstrap.ts`, `src/commands/manage/repair.ts`, and CLI contract tests.

### SELF-CLASS-003 — Capability discovery

Harness capability discovery, rather than a `skills/<kind>/...` path assumption, supplies a source for every classified managed skill.

Evidence: `inspectHarnessRoot`, `bootstrapSkillSources`, and local-development repair coverage.

## Bootstrap and repair

### SELF-BOOTSTRAP-001 — Shared bootstrap inventory

Bootstrap, refresh, and local-development activation all consume the authoritative bootstrap inventory. A required member missing from a canonical harness fails before projection.

Evidence: `src/agents/bootstrap.ts` and bootstrap CLI tests.

### SELF-REPAIR-001 — Configured-skill coverage

`ki manage repair` examines every configured managed identity, not only bootstrap members, and reports unavailable sources or incompatible agents as an error.

Evidence: `src/commands/manage/repair.ts` and repair CLI tests.

### SELF-REPAIR-002 — Local capability resolution

When canonical local-harness development is active, repair resolves its sources through inspected capabilities. It must not reconstruct a skill path from a category or directory convention.

Evidence: `localBootstrapHarness()` and local-development repair CLI tests.

### SELF-REPAIR-003 — Automation failure signal

A repair failure is observable to automation: its summary is `FAIL` and the command exits non-zero.

Evidence: repair CLI tests.

## Presentation

### SELF-OUTPUT-001 — Human-facing report frame

Human-facing inventories, diagnostics, inspections, repairs, and upgrade reports use a titled tree frame. Group labels retain useful counts; state is expressed with black-and-white glyphs; and the final line gives a compact summary.

Evidence: `src/commands/manage/{list,diag,repair,update}.ts`, `src/commands/{agora,repo,trade}/`, and their CLI contract tests.

### SELF-OUTPUT-002 — Contract-oriented output boundary

Do not frame output whose contract is a plain stream, a complete canonical record, a generated asset, or an immediate action receipt. Keep those interfaces concise and stable for their direct consumer.

Evidence: `ki registry list`, `ki manage docs`, generated completions, `ki trade show`, and action commands such as `ki skill add` and `ki trade receive`.

## Judgment

- Decide whether a proposed local requirement is specific to the `ki` host before adding it here. Promote reusable governance to the harness instead.
- Keep a rubric rule tied to a classification and evidence surface. Do not encode temporary implementation detail or use the rubric to duplicate ordinary contribution instructions.
- Treat a human-readable display pattern as local until evidence shows it is useful across compatible CLI repositories; then promote it to `ki-tools` rather than expanding this skill indefinitely.
- Native `ki repo audit --skill ki-self` execution, rubric publication, and runtime projection are governed by the harness decision requested in [TRD-af376594](../../../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-af376594.md). Until then, this committed rubric is the source contract, not a claimed host capability.
