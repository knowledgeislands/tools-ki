# Skill activation and rubrics — SKILL

This area specifies user and repository skill activation plus public rubric publication; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Activation scopes

### SKILL-001 — Compatible user activation

`ki skill add` MUST activate portable and runtime-bound skills only for configured agents compatible with the skill.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/skill/skill.test.ts` — `activates portable and runtime-bound skills only for compatible configured agents`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### SKILL-002 — Explicit repository activation

`ki repo skill add` MUST declare and project a repository skill only after it has validated the selected repository and the intersection of repository and skill runtimes.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/skill/skill.test.ts` — `intersects repository and skill runtimes before linking or declaring` and `activates a repository skill in every preflighted target`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### SKILL-003 — Protected foreign state

`ki skill remove` and `ki repo skill remove` MUST refuse to remove a foreign managed-skill directory.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/skill/skill.test.ts` — `refuses to remove a foreign user skill directory` and `refuses to remove a foreign repository skill directory`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### SKILL-004 — Published rubric fidelity

`ki dev skill rubric` MUST render a skill's mechanical and judgment items in sync with its generated on-disk rubric.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/skill/rubric.test.ts` — `renders mechanical and judgment items and reports in sync once written`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
