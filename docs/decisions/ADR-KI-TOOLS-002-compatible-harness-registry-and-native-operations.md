---
id: ADR-KI-TOOLS-002
title: 'Compatible harness registry and native operations'
date: 2026-08-06
status: current
type: Architecture Decision Record
type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_type: architecture
decision_depends_on:
  - ADR-KI-TOOLS-001
---

# ADR-KI-TOOLS-002: Compatible harness registry and native operations

## Context

The `ki` host runs native repository operations without repository-vendored runners and supports explicitly installed compatible harnesses alongside its required base `knowledgeislands/ki-agentic-harness`. Capability identity, user and repository state, and native-operation trust need clear boundaries.

Homebrew and Cargo demonstrate useful separation between an installed tool, named packages, an inventory, and per-project use. KI does not inherit either system's package format, registry, or supply-chain model: compatible harness artefacts and their published contract remain the harness and Specifications concerns.

## Decision

`ki` owns an XDG-managed registry of verified compatible harnesses. `$XDG_CONFIG_HOME/ki/config.toml` records configured harness identities and immutable acquisition evidence. `$XDG_DATA_HOME/ki/harnesses/<owner>/<repository>/` holds each verified installed harness, while `$XDG_CACHE_HOME/ki` and `$XDG_STATE_HOME/ki` hold disposable acquisition material and locks or mutable state. Standard XDG defaults apply when a variable is unset; KI defines no separate home variable.

A private GitHub archive opts in explicitly through `auth = "github-cli"` on its configured release. That form is valid only for the matching commit-pinned `https://codeload.github.com/<owner>/<repository>/tar.gz/<revision>` URL. For it alone, `ki` asks the authenticated GitHub CLI for a token and sends it only on the no-redirect archive request; it never stores, prints, or permits credentials in the release URL. Public releases use the unchanged unauthenticated path.

The base `knowledgeislands/ki-agentic-harness` is always registered and required. `ki harness install <harness-id>` validates the configured immutable archive, its checksum, and its extracted capability inventory before atomically installing or replacing the harness. `ki harness uninstall <harness-id>` removes an explicitly installed non-base harness only with ownership proof. Harness and capability selection use the verified installed root; users cannot select an arbitrary capability version.

Capability references are qualified identities from the compatible-harness contract. A skill is `<harness-id>:<skill-name>`. A bare skill name is accepted only when exactly one installed harness supplies it; `ki` stores and reports its resolved qualified identity and rejects ambiguity.

The public command grammar makes mutation scope explicit: `ki repo skill add|remove <skill>` changes only a resolved repository and its managed runtime projection, while `ki skill add|remove <skill>` changes only the selected user runtime. `ki manage list` inventories installed harnesses, capabilities, and user activation without resolving a repository. `ki harness list` and `ki harness info` present harness-focused inventory and health.

The package-management vocabulary is reserved as follows: `ki manage missing` and `ki manage outdated` report user status; `ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage named harnesses; `ki manage update` updates the executable and installed harnesses; and `ki repo upgrade` applies available compatible capability releases. These forms preserve the explicit user and `ki repo` activation boundary.

Every `ki repo` operation accepts the shared `--repo <path-or-pattern>` selector. With it, each target must physically resolve to the repository base and directly contain a regular `.ki-config.toml`. Without it, the host resolves only the current working directory as that repository; it never searches ancestors. It reads the declaration, requires explicit dependencies, resolves only registered compatible operations from verified installed harnesses, and orders them through one finding and reporting model. Resolution uses a stable topological order: dependency edges place prerequisites first, while repository table order and dependency-array order have no semantic effect; otherwise independent capabilities are ordered by canonical name.

Native operations are imported in process only after harness and inventory validation. `ki repo audit` is read-only. `ki repo conform` validates the entire safe write transaction, honours dry-run, commits only the declared safe set, and re-audits. Repository operations never dispatch `.ki/bin`, `.ki/bootstrap`, copied `govern.ts`, package-script aliases, or an ad-hoc child process. Local harness development is an explicit, verified projection under `ki dev`, never an unregistered repository-operation fallback. Legacy state is an explicit fail-closed migration input only.

## Consequences

- `tools-ki` becomes the sole owner of registry layout, command grammar, physical repository resolution, reporting, activation, migration, and native execution.
- The base harness and an organisation harness can coexist without merging their source trees or treating either checkout as installed state.
- A private GitHub harness can use the user's existing GitHub CLI authentication without placing a token in KI configuration or sending it to another host.
- User commands do not resolve the CWD, while every `ki repo` command can discover one repository or use an explicit override.
- The active implementation surface comprises `ki --help`, `ki --version`, `ki acquire`, `ki bootstrap`, `ki dev`, `ki manage`, `ki harness`, `ki repo`, and `ki skill`.
- Release and Homebrew delivery remain separate from harness registration and do not authorise a tag, publication, or push.

## References

- [ADR-KI-TOOLS-001](ADR-KI-TOOLS-001-typescript-native-command-host.md) — the TypeScript-native executable host.
