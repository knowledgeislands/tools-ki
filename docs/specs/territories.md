# Territory selection — TERRITORY

This area specifies KI's implementation of the [accepted territory decision](https://github.com/knowledgeislands/ki-arcadia-principal/blob/main/Admin/Governance/Decisions/ADR-KI-ARCADIA-002-territory-derived-repository-selection.md).

## Selection

### TERRITORY-001 — Canonical Capital membership

KI MUST derive territory membership from the Capital's flat `ki-repo.territory_name` and `territory_members`. The optional Capital-only `territory_prefix` MUST be a lower-case hyphenated slug; without it the handle MUST be the Capital's registry key. An explicit prefix MUST replace the key as a selector. Duplicate handles, including prefix/key collisions, MUST fail. Selection MUST NOT depend on valid trade routing.

_Conformance:_ conforming

_Verify:_ `src/core/territory/declaration.ts`, `src/core/territory/resolution.ts`; `src/tests/cli/territory/selection.test.ts`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-002 — Literal filters and native defaults

Supported operations MUST accept `-t, --territory`, `--estate` and repeatable `-f, --filter`. Primary scopes MUST conflict with one another and explicit repository selection. Filters MUST match directory basenames literally and case-sensitively with OR semantics, before worktree expansion, including on the caller's native default. Empty values and zero matches MUST fail. Commands that cannot use selectors MUST reject them.

_Conformance:_ conforming

_Verify:_ `src/core/repository/selection.ts`, `src/core/repository/mgit.ts`; public CLI selection and target fixtures.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-003 — Complete and atomic selection

KI MUST validate Capital metadata and full member registration before filtering. It MUST validate selected physical roots, canonical checkout identity and declared Capital afterwards. Missing registration MUST fail even when a filter would exclude the member; an excluded registered unavailable root MUST NOT fail the remaining operations. The roots endpoint MUST emit deterministic NUL-delimited absolute primary checkouts under `--null`, only after complete validation, with no partial stdout on error.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/territory/selection.test.ts` exercises registration, unavailable roots, ambiguity, mismatch, literal filters and atomic output.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-004 — Local opening and observation

Territory opening MUST use the existing local target adapters. Inspection MUST remain read-only and classify matched, missing, extra registered, unregistered KI and external roots. Legacy Agora grammar, runtime membership, inclusions and reference associations MUST have no selection role; historical XDG files MUST be preserved.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/territory/inspect.test.ts` and territory opening fixtures.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

None.
