---
id: ADR-KI-TOOLS-002
title: 'Compatible harness registry and native operations'
date: 2026-07-24
status: current
type: Architecture Decision Record
type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_type: architecture
decision_depends_on:
  - ADR-KI-TOOLS-001
---

# ADR-KI-TOOLS-002: Compatible harness registry and native operations

## Context

The `ki` host must replace repository-vendored runners without limiting a user to one skill collection. It always needs the base `knowledgeislands/ki-agentic-harness` and must support explicitly installed compatible harnesses, while keeping capability identity, user and repository state, and native-operation trust clear.

Homebrew and Cargo demonstrate useful separation between an installed tool, named packages, an inventory, and per-project use. KI does not inherit either system's package format, registry, or supply-chain model: compatible harness artefacts and their published contract remain the harness and Specifications concerns.

## Decision

`ki` owns an XDG-managed registry of verified compatible harnesses. `$XDG_CONFIG_HOME/ki/harnesses.toml` records configured harness identities and their immutable acquisition evidence. `$XDG_DATA_HOME/ki/harnesses/<harness-id>/latest/` holds each verified installed regular-file harness, while `$XDG_CACHE_HOME/ki` and `$XDG_STATE_HOME/ki` hold disposable acquisition material and locks or mutable state. Standard XDG defaults apply when a variable is unset; KI defines no separate home variable.

The base `knowledgeislands/ki-agentic-harness` is always registered and required. `ki harness install <harness-id>` validates immutable evidence, validates the published `harness.toml` and inventory, and atomically replaces that harness's `latest` slot. `ki harness uninstall <harness-id>` removes an explicitly installed non-base harness only with ownership proof. Initial selection is always `latest`; no user-selectable harness or capability version exists. A later versioning design may add versioned siblings beside `latest` only with compatibility and integrity evidence.

Capability references are qualified identities from the compatible-harness contract. A skill is `<harness-id>:<skill-name>`; other capability kinds use the reserved `<harness-id>:<kind>/<name>` shape. A bare skill name is accepted only when exactly one installed harness supplies it; `ki` stores and reports its resolved qualified identity and rejects ambiguity.

The public command grammar makes mutation scope explicit: `ki repo skill add|remove <skill>` changes only a resolved repository and its managed runtime projection, while `ki user skill add|remove <skill>` changes only the selected user runtime. `ki list` inventories installed harnesses and capabilities plus user activation and, when CWD resolves to a repository, repository activation. `ki harness list` and `ki harness info` present harness-focused inventory and health.

The package-management vocabulary is reserved as follows: `ki missing` and `ki outdated` report status; `ki install`, `ki reinstall`, and `ki uninstall` manage named capabilities; `ki update` updates the executable and installed harnesses; and CWD-resolved `ki upgrade` applies available compatible capability releases. These forms must preserve the explicit `ki repo` and `ki user` activation boundary before they are exposed as working commands.

Every `ki repo` command accepts `--repo <path>`. With it, `<path>` must physically resolve to the repository base and directly contain a regular `.ki-config.toml`. Without it, the host physically resolves CWD then ascends its ancestors to the nearest such repository, stopping before the user home directory and filesystem root. It reads the declaration, requires explicit dependencies, resolves only registered compatible operations from verified installed harnesses, and orders them through one finding and reporting model. Resolution uses a stable topological order: dependency edges place prerequisites first, while repository table order and dependency-array order have no semantic effect; otherwise independent capabilities are ordered by canonical name.

Native operations are imported in process only after harness and inventory validation. `ki repo audit` is read-only. `ki repo conform` validates the entire safe write transaction, honours dry-run, commits only the declared safe set, and re-audits. The host never dispatches `.ki/bin`, `.ki/bootstrap`, copied `govern.ts`, package-script aliases, a nearby harness checkout, or an ad-hoc child process. Legacy state is an explicit fail-closed migration input only.

## Consequences

- `tools-ki` becomes the sole owner of registry layout, command grammar, physical repository resolution, reporting, activation, migration, and native execution.
- The base harness and an organisation harness can coexist without merging their source trees or treating either checkout as installed state.
- Commands can report a consistent CWD-derived status while still allowing a deliberate repository override.
- The active implementation surface comprises `ki help`, `ki version`, `ki completions`, `ki acquire`, `ki bootstrap`, `ki dev`, `ki diag`, `ki doctor`, `ki harness`, `ki install`, `ki list`, `ki reinstall`, `ki repo`, `ki skill`, `ki uninstall`, `ki update`, and `ki upgrade`. Planned commands remain visible in documentation and `ki(1)` but do not appear in HELP or completion until they have tests and release evidence.
- Release and Homebrew delivery remain separate from harness registration and do not authorise a tag, publication, or push.

## References

- [ADR-KI-TOOLS-001](ADR-KI-TOOLS-001-typescript-native-command-host.md) — the TypeScript-native executable host.
