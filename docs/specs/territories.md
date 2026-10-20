# Territory selection — TERRITORY

This area specifies KI's implementation of the [accepted territory decision](https://github.com/knowledgeislands/ki-principal/blob/main/Admin/Governance/Decisions/ADR-KI-PRINCIPAL-002-territory-derived-repository-selection.md).

## Selection

### TERRITORY-001 — Canonical Capital membership

KI MUST derive territory membership from the Capital's flat `ki-repo.territory_name` and `territory_members`. The optional Capital-only `territory_prefix` MUST be a lower-case hyphenated slug; without it the handle MUST be the Capital's registry key. An explicit prefix MUST replace the key as a selector. Duplicate handles, including prefix/key collisions, MUST fail. A Capital MAY declare optional [aliases](#territory-007--territory-aliases). Selection MUST NOT depend on valid trade routing.

_Conformance:_ conforming

_Verify:_ `src/core/territory/declaration.ts`, `src/core/territory/resolution.ts`; `src/tests/cli/territory/selection.test.ts`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-002 — Literal filters and native defaults

Supported operations MUST accept `-t, --territory`, `--estate`, `--principals` and repeatable `--filter`, with no short form. Primary scopes MUST conflict with one another and explicit repository selection. Filters MUST match directory basenames literally and case-sensitively with OR semantics, before worktree expansion, including on the caller's native default. Empty values and zero matches MUST fail. Commands that cannot use selectors MUST reject them.

_Conformance:_ conforming

_Verify:_ `src/core/repository/selection.ts`, `src/core/repository/mgit.ts`; public CLI selection and target fixtures.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-003 — Complete and atomic selection

KI MUST validate Capital metadata and full member registration before filtering. It MUST validate selected physical roots, canonical checkout identity and declared Capital afterwards. Missing registration MUST fail even when a filter would exclude the member, except in `ki territory show` and `ki territory audit`, which MUST instead name each unregistered declared member whose last identity segment the filters match, MUST still check and list the registered members, and MUST exit 1 while any is reported; an excluded registered unavailable root MUST NOT fail the remaining operations. The roots endpoint MUST emit deterministic NUL-delimited absolute primary checkouts under `--null`, only after complete validation, with no partial stdout on error.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/territory/selection.test.ts` exercises registration, reported unregistered members in show and audit, unavailable roots, ambiguity, mismatch, literal filters and atomic output.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-004 — Local opening and observation

Territory opening MUST use the existing local target adapters. Inspection MUST remain read-only and classify matched, missing, extra registered, unregistered KI and external roots. Legacy Agora grammar, runtime membership, inclusions and reference associations MUST have no selection role; historical XDG files MUST be preserved.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/territory/inspect.test.ts` and territory opening fixtures.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-005 — Principals selection

`--principals` MUST select every registered Capital discovered from its available checkout and no other repository, each as an owner root, in territory order. Territory order MUST place ranked territories first in [ranking](#territory-006--personal-territory-ranking) order; the remaining Capitals MUST follow the derived order: the system Capital, whose `territory_members` include the canonical KI Harness `https://github.com/knowledgeislands/ki-agentic-harness`, first, then territory name in English collation, then handle. Without such a Capital the name order MUST apply to all unranked Capitals. `ki territory list` MUST list territories in the same order. Literal filters MUST narrow Capital basenames without changing that order. Opening MUST preserve the order in each target's resulting project list, compensating for Zed's prepend behaviour.

_Conformance:_ conforming

_Verify:_ `src/core/territory/resolution.ts`; `src/tests/cli/territory/principals.test.ts` exercises ordering, filters, conflicts, inspection, repository, registry and trade selection, and the Zed, VS Code and Delta invocation order.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-006 — Personal territory ranking

A user MAY rank territories in the `ki` user configuration, `$XDG_CONFIG_HOME/ki/config.toml`, as `[territories] ranking`: an array of distinct territory handles. It is a personal preference, never Capital or repository metadata. A present `[territories]` table MUST contain only `ranking`, and a present `ranking` MUST be such an array; any other shape MUST fail as a configuration error before selection. An absent ranking, or an absent or unreadable configuration file, MUST leave the derived order unchanged. The ranking MUST order every multi-territory selection: `--principals` and `ki territory list` by [TERRITORY-005](#territory-005--principals-selection), and `--estate` roots by the earliest-ranked territory whose `territory_members` declare them, physical-path order within each, followed by every other root in its unranked physical-path order. A single `--territory` selection MUST neither read nor apply the ranking. A ranked handle that no registered Capital declares MUST NOT fail selection; `ki territory` commands MUST report it as a warning on standard error.

_Conformance:_ conforming

_Verify:_ `src/core/territory/ranking.ts`, `src/core/territory/resolution.ts`; `src/tests/cli/territory/ranking.test.ts` exercises the unset fallback, a partial ranking across principals, list, estate, filters, a single territory, repository and Zed opening, unknown-handle warnings and malformed configuration.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TERRITORY-007 — Territory aliases

A Capital MAY declare `ki-repo.territory_aliases`: an array of distinct lower-case hyphenated identifiers that select its territory exactly as its canonical handle does, wherever a `--territory` selector is accepted. An absent or empty array MUST leave selection unchanged. A non-array value, an invalid identifier, a repeated alias, or the key on a repository that is not a territory Capital MUST fail as declaration errors. Handles and aliases MUST share one selector namespace across every registered Capital: an alias equal to any handle, including its own Capital's, or to another Capital's alias MUST fail every territory selection before any repository is selected. Aliases MUST NOT appear in `ki territory list`, selected identities or output, MUST NOT name a sources store, and MUST NOT be a [ranking](#territory-006--personal-territory-ranking) handle.

_Conformance:_ conforming

_Verify:_ `src/core/territory/declaration.ts`, `src/core/territory/resolution.ts`; `src/tests/cli/territory/aliases.test.ts` exercises alias and handle equivalence across `show`, `roots`, `audit` and `ki repo` opening with both selector spellings, malformed and non-Capital aliases, and every collision class.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

None.
