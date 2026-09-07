# Agoras — AGORA

This area specifies named, repository-declared groups; see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Declaration and resolution

### AGORA-001 — Registered declared owner

`ki` MUST resolve a named Agora only from a registered repository's `[skills.ki-agora.homes.<id>]` declaration. The declaration MUST name its declaring repository's canonical identity as `owner`; that repository is a projection participant without separately declaring membership.

_Verify:_ `src/core/agora/index.ts` — `homeDeclarations` and `profileFromHome`; `src/tests/cli/agora/agora.test.ts` covers owner inclusion and invalid owners.

### AGORA-002 — Reciprocal additional membership

Every member other than the owner MUST be registered locally and reciprocally declare the declared owner and matching role.

_Verify:_ `src/core/agora/index.ts` — `profileFromHome`; `src/tests/cli/agora/agora.test.ts` covers one-sided and malformed membership declarations.

### AGORA-003 — Globally unique names

An Agora identifier MUST be declared by no more than one registered owner. Listing or resolving duplicates MUST fail and identify every owner.

_Verify:_ `src/core/agora/index.ts` — `uniqueProfiles`; `src/tests/cli/agora/agora.test.ts` covers duplicate identifiers.

### AGORA-004 — Validated declared configuration

`ki` MUST reject malformed, unregistered, or non-reciprocal declared Agora configuration before using it.

_Verify:_ `src/tests/cli/agora/agora.test.ts` — malformed registered repository and Agora declaration coverage.

### AGORA-005 — Inspection and opening

`ki agora list` and `ki agora show` MUST expose the resolved owner-inclusive group, while `ki agora open` MUST launch the resolved group through an explicitly selected supported local target and report a launch failure.

_Verify:_ `src/tests/cli/agora/agora.test.ts` — list, show, open, and launch-failure coverage.

### AGORA-006 — Machine-readable physical roots

`ki agora roots <name>` MUST resolve a named Agora or `estate` through the registered reciprocal-Agora resolver and write its ordered absolute physical roots to standard output. By default it MUST write one line feed after every root; `--null` (or `-0`) MUST instead write one NUL byte after every root. Callers that need to preserve arbitrary pathnames MUST use `--null`.

The command MUST fail without writing roots when resolution fails or selects no members. Its line and NUL byte encodings are the V1 compatibility contract; a future encoding MUST use a new explicit option rather than changing either existing format.

_Verify:_ `src/tests/cli/agora/agora.test.ts` — `writes deterministic machine-readable roots for named Agoras and the estate` and `fails without roots for unknown, empty, missing, or non-reciprocal Agora selectors`.

### AGORA-007 — Declared projection order

A named Agora home MAY declare `order` as a duplicate-free ordered prefix of canonical repository identities already participating as its owner, reciprocal members, or external references. Every named-Agora consumer MUST place that prefix first and append unlisted participants in lexical local-key order. Without `order`, named Agoras MUST retain lexical local-key order. The system-managed `estate` projection MUST remain in lexical local-registry-key order.

`ki` MUST reject an `order` value that is not an array or contains a non-canonical, repeated, or non-participating repository identity.

_Verify:_ `src/core/agora/index.ts` — `homeDeclarations` and `profileFromHome`; `src/tests/cli/agora/agora.test.ts` covers ordered and absent-order projections through show, roots, open, and repository selection, plus malformed declarations.

### AGORA-008 — Explicit health audit

`ki agora audit [name]` MUST report deterministic health findings from the canonical Agora resolver without changing repository declarations, the local registry, or peer repositories; with no name it audits every declared profile, while an explicit name selects only that declared profile or the registered `estate`.

_Verify:_ `src/tests/cli/agora/audit.test.ts` covers healthy, mixed, unavailable, duplicate, non-reciprocal, malformed, estate, and explicitly selected profiles.

### AGORA-009 — Health audit exit status

`ki agora audit` MUST exit `0` when every selected profile is healthy, `1` after rendering any selected health finding, and `2` for invalid grammar or an unknown explicit profile selector.

_Verify:_ `src/tests/cli/agora/audit.test.ts` asserts output and exit status through the CLI seam; `src/tests/cli/root/help.test.ts` and `src/tests/cli/manage/completions.test.ts` verify command discovery.

### AGORA-010 — Read-only editor projection observation

`ki agora inspect <name> --target <zed|vscode> --workspace <selector>` MUST observe only the explicitly selected local editor workspace, MUST validate a target-owned source before reading workspace roots, and MUST NOT change editor, repository, or registry state, as established by [ADR-KI-TOOLS-003](../decisions/ADR-KI-TOOLS-003-read-only-editor-projection-observation.md).

_Verify:_ `src/tests/cli/agora/inspect.test.ts` covers physical VS Code workspace files, stable and preview Zed databases, schema validation, explicit selectors, read-only evidence, and fail-closed unsupported sources.

### AGORA-011 — Shared projection classification

`ki agora inspect` MUST compare target-observed roots with the canonical resolved Agora profile through one target-neutral classifier and MUST report matched members, missing members, extra registered repositories, unregistered KI repositories, and external roots deterministically.

_Verify:_ `src/tests/cli/agora/inspect.test.ts` exercises every classification using paths with spaces, JSONC relative paths, file URIs, non-file URIs, and duplicate-free deterministic totals.

### AGORA-012 — Projection inspection exit status

`ki agora inspect` MUST exit `0` for an exact projection, `1` after rendering drift or when the selected target source cannot be supported safely, and `2` for invalid selectors or Agora resolution failures.

_Verify:_ `src/tests/cli/agora/inspect.test.ts` asserts exact, drift, unavailable, malformed, remote, ambiguous, invalid-selector, and invalid-resolution outcomes through the CLI seam; `src/tests/cli/root/help.test.ts` and `src/tests/cli/manage/completions.test.ts` verify command discovery.

### AGORA-013 — External reference associations

An owner-declared Agora reference MUST remain distinct from reciprocal KI membership. `ki agora reference set <repository> <checkout>` MUST accept only a declared canonical reference identity and one explicitly selected absolute physical Git checkout root whose canonical `origin` matches that identity. The association MUST be machine-local, MUST NOT require `.ki.toml`, and MUST NOT register, clone, or mutate the referenced repository.

_Verify:_ `src/tests/cli/agora/references.test.ts` — `associates a plain Git checkout and projects typed owner and reference roots`; `rejects unsafe selections and malformed association stores`.

### AGORA-014 — Typed reference resolution

Agora resolution MUST classify projected roots as `owner`, `member`, or `reference`. A declared reference with no usable unique association MUST produce an `unassociated`, `missing`, `ambiguous`, or `remote-mismatch` diagnostic and MUST be omitted from projected roots without invalidating or reclassifying the resolved owner and reciprocal members. `roots`, `open`, `inspect`, `show`, and `audit` MUST consume this shared resolution result.

_Verify:_ `src/tests/cli/agora/references.test.ts` — reference projection and diagnostic coverage; `src/tests/cli/agora/inspect.test.ts` — target-neutral projection classification.

### AGORA-015 — Local association lifecycle

`ki agora reference list` MUST expose the machine-local association inventory. `ki agora reference set` MUST replace only the selected identity's association, and `ki agora reference remove` MUST remove only that local association. Promotion from reference to reciprocal membership MUST ignore stale association state and MUST NOT duplicate the root or mutate the promoted repository.

_Verify:_ `src/tests/cli/agora/references.test.ts` — `keeps association mutation local and ignores stale state after promotion to membership`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
