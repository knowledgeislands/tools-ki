# Agoras — AGORA

This area specifies named, repository-declared groups; see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Declaration and resolution

### AGORA-001 — Registered declared owner

`ki` MUST resolve a named Agora only from a registered repository's `[skills.ki-agora.<id>]` declaration. The declaring repository's canonical `ki-repo.repository` identity is the owner and a projection participant without appearing in `members`.

_Conformance:_ conforming

_Verify:_ `src/core/agora/index.ts` — `homeDeclarations` and `profileFromHome`; `src/tests/cli/agora/agora.test.ts` covers owner inclusion and invalid owners.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-002 — Owner-declared additional membership

Every direct member other than the owner MUST be registered locally. The owner declares members as a duplicate-free array of canonical repository identities; members need no Agora configuration. The resolver MUST reject legacy role-bearing and member-side declarations.

_Conformance:_ conforming

_Verify:_ `src/core/agora/declarations.ts` — `homeDeclaration` and `membersFromHome`; `src/tests/cli/agora/agora.test.ts` covers owner-only declarations and malformed membership lists.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-003 — Globally unique names

An Agora identifier MUST be declared by no more than one registered owner. Listing or resolving duplicates MUST fail and identify every owner.

_Conformance:_ conforming

_Verify:_ `src/core/agora/index.ts` — `uniqueProfiles`; `src/tests/cli/agora/agora.test.ts` covers duplicate identifiers.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-004 — Validated declared configuration

`ki` MUST reject malformed or unregistered declared Agora configuration before using it.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/agora.test.ts` — malformed registered repository and Agora declaration coverage.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-005 — Inspection and opening

`ki agora list` and `ki agora show` MUST expose the resolved owner-inclusive group, while `ki agora open` MUST launch the resolved group through an explicitly selected supported local target and report a launch failure.

For a named Agora opened in Zed, the owner MUST appear first in the sidebar, followed by the other roots in registry-key order. The ownerless estate, VS Code launch arguments, repository selection, and machine-readable `ki agora roots` order MUST remain unchanged.

The text list MUST label the declaring owner as `home`, pluralise member and reference counts correctly, and call its registered-estate summary count `REGISTERED_REPOSITORIES`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/agora.test.ts` — list, show, open, and launch-failure coverage.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-006 — Machine-readable physical roots

`ki agora roots <name>` MUST resolve a named Agora or `estate` through the owner-declared resolver and write its alphabetically ordered absolute physical roots to standard output. By default it MUST write one line feed after every root; `--null` (or `-0`) MUST instead write one NUL byte after every root. Callers that need to preserve arbitrary pathnames MUST use `--null`.

The command MUST fail without writing roots when resolution fails or selects no members. Its line and NUL byte encodings are the V1 compatibility contract; a future encoding MUST use a new explicit option rather than changing either existing format.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/agora.test.ts` — `writes deterministic machine-readable roots for named Agoras and the estate` and `fails without roots for unknown, empty, or missing Agora selectors`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-007 — Alphabetical projection and inclusion

A named Agora owner MAY declare `includes` as a duplicate-free list of Agora identifiers and canonical repository identities. An included Agora MUST contribute only its owner and direct members; an included repository MUST contribute only its own root. Registered repository inclusions MUST resolve through the local registry, while unregistered Git repositories require an explicit matching local association. Inclusion MUST NOT grant membership or repository authority.

Every named-Agora consumer MUST deduplicate by canonical repository identity and sort projected roots in lexical local-key order. The system-managed `estate` projection MUST remain in lexical local-registry-key order. The resolver MUST reject malformed, repeated, self-referential, or unknown group inclusions and legacy `order` declarations.

_Conformance:_ conforming

_Verify:_ `src/core/agora/declarations.ts`, `profiles.ts`, and `resolution.ts`; `src/tests/cli/agora/agora.test.ts` covers group and registered-repository inclusions through show, roots, open, and repository selection, plus malformed declarations.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-008 — Explicit health audit

`ki agora audit [name]` MUST report deterministic health findings from the owner-declared Agora resolver without changing repository declarations, the local registry, or peer repositories; with no name it audits every declared profile, while an explicit name selects only that declared profile or the registered `estate`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/audit.test.ts` covers healthy, mixed, unavailable, duplicate, malformed, estate, and explicitly selected profiles.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-009 — Health audit exit status

`ki agora audit` MUST exit `0` when every selected profile is healthy, `1` after rendering any selected health finding, and `2` for invalid grammar or an unknown explicit profile selector.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/audit.test.ts` asserts output and exit status through the CLI seam; `src/tests/cli/root/help.test.ts` and `src/tests/cli/manage/completions.test.ts` verify command discovery.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-010 — Read-only editor projection observation

`ki agora inspect <name> --target <zed|vscode> --workspace <selector>` MUST observe only the explicitly selected local editor workspace, MUST validate a target-owned source before reading workspace roots, and MUST NOT change editor, repository, or registry state, as established by [ADR-KI-TOOLS-003](../decisions/ADR-KI-TOOLS-003-read-only-editor-projection-observation.md).

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/inspect.test.ts` covers physical VS Code workspace files, stable and preview Zed databases, schema validation, explicit selectors, read-only evidence, and fail-closed unsupported sources.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-011 — Shared projection classification

`ki agora inspect` MUST compare target-observed roots with the canonical resolved Agora profile through one target-neutral classifier and MUST report matched members, missing members, extra registered repositories, unregistered KI repositories, and external roots deterministically.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/inspect.test.ts` exercises every classification using paths with spaces, JSONC relative paths, file URIs, non-file URIs, and duplicate-free deterministic totals.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-012 — Projection inspection exit status

`ki agora inspect` MUST exit `0` for an exact projection, `1` after rendering drift or when the selected target source cannot be supported safely, and `2` for invalid selectors or Agora resolution failures.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/inspect.test.ts` asserts exact, drift, unavailable, malformed, remote, ambiguous, invalid-selector, and invalid-resolution outcomes through the CLI seam; `src/tests/cli/root/help.test.ts` and `src/tests/cli/manage/completions.test.ts` verify command discovery.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-013 — External reference associations

An owner-declared repository inclusion MUST remain distinct from direct KI membership. `ki agora reference set <repository> <checkout>` MUST accept only a declared canonical repository inclusion and one explicitly selected absolute physical Git checkout root whose canonical `origin` matches that identity. The association MUST be machine-local, MUST NOT require `.ki.toml`, and MUST NOT register, clone, or mutate the included repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/references.test.ts` — `associates a plain Git checkout and projects typed owner and reference roots`; `rejects unsafe selections and malformed association stores`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-014 — Typed reference resolution

Agora resolution MUST classify projected roots as `owner`, `member`, or `reference`. Included group roots and included repository roots are references in the including Agora; registered ones resolve through the registry. An unregistered repository inclusion with no usable unique association MUST produce an `unassociated`, `missing`, `ambiguous`, or `remote-mismatch` diagnostic and MUST be omitted from projected roots without invalidating direct members. `roots`, `open`, `inspect`, `show`, and `audit` MUST consume this shared resolution result.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/references.test.ts` — reference projection and diagnostic coverage; `src/tests/cli/agora/inspect.test.ts` — target-neutral projection classification.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-015 — Local association lifecycle

`ki agora reference list` MUST expose the machine-local association inventory. `ki agora reference set` MUST replace only the selected identity's association, and `ki agora reference remove` MUST remove only that local association. Promotion from repository inclusion to direct membership MUST ignore stale association state and MUST NOT duplicate the root or mutate the promoted repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/references.test.ts` — `keeps association mutation local and ignores stale state after promotion to membership`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### AGORA-016 — Distinct human-facing participants

`ki agora list` and `ki agora show` MUST count a named Agora's owner separately from direct non-owner members and included roots, distinguish resolved from unresolved external repository inclusions, and label the system estate's participants as registered repositories without inventing a home. `show` MUST render the owner once and leave machine-readable roots and projection order unchanged.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/agora/agora.test.ts` — `lists, shows, selects, and opens an owner-declared Agora` and `includes another Agora and a registered repository in alphabetical projections`; `src/tests/cli/agora/references.test.ts` — `associates a plain Git checkout and projects typed owner and reference roots`.

_Evidence:_ The named in-process CLI tests assert exact named and estate text reports, verbose owner paths, separate references, and unchanged ordered `ki agora roots` output.

### AGORA-017 — Declared readable title

Every `[skills.ki-agora.<id>]` declaration MUST carry a `title` that is a non-empty, single-line string without leading or trailing whitespace; `ki` MUST reject a missing or malformed title like any other malformed declaration. `ki agora list` and `ki agora show` MUST present the declared title beside the identifier, and the reserved `estate` keeps its system title. The identifier MUST remain the only machine key: `--agora` selection, `ki agora roots`, lookups and folder paths never use the title, and titles need not be unique.

_Conformance:_ conforming

_Verify:_ `src/core/agora/declarations.ts` — `homeDeclaration`; `src/tests/cli/agora/agora.test.ts` — `lists, shows, selects, and opens an owner-declared Agora` and the malformed declaration cases.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
