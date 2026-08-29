# Repository-local governance

Use a repository-local `ki-self` when a Knowledge Islands repository needs auditable rules that are specific to that repository and do not belong in a portable Harness skill. The host treats this as one narrow repository-owned provider, not as installed Harness content.

## Declare the provider

Add an explicit empty table to the repository's `.ki.toml`:

```toml
[skills.ki-self]
```

The declaration grants native-operation authority only to the canonical source below the selected physical repository root:

```text
.agents/skills/ki-self/
├── SKILL.md
├── references/
│   ╰── rubric.md
╰── scripts/
    ╰── rubric/
        ╰── items/
            ╰── index.ts
```

`SKILL.md` must name `ki-self` and declare its dependencies in normal skill frontmatter. `scripts/rubric/items/index.ts` must default-export the supported native rubric contract. `references/rubric.md` is generated publication; edit the catalogue and regenerate the publication rather than hand-editing it.

## Audit and conform

Run the focused audit from any directory by naming the repository explicitly:

```sh
ki repo audit --skill ki-self --repo /path/to/repository
```

The report identifies the provider as `repository-local:ki-self`. Run conform when the catalogue offers safe native proposals such as refreshing its generated publication:

```sh
ki repo conform --skill ki-self --repo /path/to/repository
```

Conform uses the same repository-scoped transaction and re-audit as installed capabilities. It does not activate the local source as a managed runtime skill or turn it into an installed Harness.

## Diagnose failures

The host fails before importing catalogue code when the declaration is missing, the canonical source or catalogue is absent, an entry in the source tree is a symbolic link, the source escapes the physical repository, or `SKILL.md` names another capability. Restore a physical canonical source and rerun the focused audit; do not add a caller-selected local path or copy the skill into an installed Harness.

`ki repo diag` reports the canonical local provider without expecting a managed projection. `ki repo upgrade` refreshes only installed Harness providers and ignores repository-local `ki-self`.

The provider boundary is specified by [REPO-OPS-013](../specs/repository-operations.md#repo-ops-013--repository-local-self-governance) and decided in [ADR-KI-TOOLS-002](../decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md).
