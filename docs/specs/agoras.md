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

A named Agora home MAY declare `order` as a duplicate-free ordered prefix of canonical repository identities already participating as its owner or reciprocal members. Every named-Agora consumer MUST place that prefix first and append unlisted participants in lexical local-registry-key order. Without `order`, named Agoras MUST retain lexical local-registry-key order. The system-managed `estate` projection MUST remain in lexical local-registry-key order.

`ki` MUST reject an `order` value that is not an array or contains a non-canonical, repeated, or non-participating repository identity.

_Verify:_ `src/core/agora/index.ts` — `homeDeclarations` and `profileFromHome`; `src/tests/cli/agora/agora.test.ts` covers ordered and absent-order projections through show, roots, open, and repository selection, plus malformed declarations.

### AGORA-008 — Explicit health audit

`ki agora audit [name]` MUST report deterministic health findings from the canonical Agora resolver without changing repository declarations, the local registry, or peer repositories; with no name it audits every declared profile, while an explicit name selects only that declared profile or the registered `estate`.

_Verify:_ `src/tests/cli/agora/audit.test.ts` covers healthy, mixed, unavailable, duplicate, non-reciprocal, malformed, estate, and explicitly selected profiles.

### AGORA-009 — Health audit exit status

`ki agora audit` MUST exit `0` when every selected profile is healthy, `1` after rendering any selected health finding, and `2` for invalid grammar or an unknown explicit profile selector.

_Verify:_ `src/tests/cli/agora/audit.test.ts` asserts output and exit status through the CLI seam; `src/tests/cli/root/help.test.ts` and `src/tests/cli/manage/completions.test.ts` verify command discovery.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
