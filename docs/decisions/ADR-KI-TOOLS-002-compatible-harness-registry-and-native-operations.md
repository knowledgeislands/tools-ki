---
id: ADR-KI-TOOLS-002
title: 'Compatible harness registry and native operations'
date: 2026-08-06
status: current
decision_type_url: https://knowledgeislands.info/specifications/decision-records/adr
decision_type: architecture
decision_depends_on:
  - ADR-KI-TOOLS-001
---

# ADR-KI-TOOLS-002: Compatible harness registry and native operations

## Context

The `ki` host runs native repository operations without repository-vendored runners and supports explicitly installed compatible harnesses alongside its required base `knowledgeislands/ki-agentic-harness`. Capability identity, installation trust, and user and repository activation have distinct boundaries. A governed repository may additionally own one mutable `ki-self` source for rules specific to that repository; treating it as an installed portable capability would erase both its ownership and the installed-Harness trust boundary.

## Decision

`ki` owns an XDG-managed registry of verified compatible harnesses. Configuration records harness identities and immutable acquisition evidence; data holds verified installations; cache and state hold disposable acquisition material, locks, and mutable state. Standard XDG defaults apply, and KI defines no separate home variable.

A private GitHub archive opts in through `auth = "github-cli"` and a matching commit-pinned codeload URL. For that form alone, `ki` obtains a GitHub CLI token for a no-redirect request; it never stores or prints the token, accepts credentials in a release URL, or sends the token to another host. Public releases remain unauthenticated.

The base `knowledgeislands/ki-agentic-harness` is always registered and required. Harness installation validates the immutable archive, checksum, explicit `[skills.ki-repo-harness].prefix`, and capability inventory before atomic replacement. Uninstallation requires ownership proof and cannot remove the base harness. Capability selection always resolves from a verified installed root rather than an arbitrary version.

Each Harness owns one lowercase alphanumeric prefix and every published skill begins with that prefix followed by `-`. The installed estate refuses a second Harness claiming an existing prefix. Repositories therefore declare skills by bare capability name and must include the providing Harness in `[repo].harnesses`; competing Harnesses in one namespace are alternatives, not simultaneously qualified providers.

The public grammar makes mutation scope explicit: `ki repo skill add|remove` changes a resolved repository and its managed runtime projection, while `ki skill add|remove` changes the selected user runtime. User inventory does not resolve a repository; harness inventory remains harness-focused.

Status, installation, update, and repository-upgrade commands preserve this user, harness, and repository activation boundary.

Every `ki repo` operation accepts the shared `--repo <path-or-pattern>` selector. Each target must physically resolve to a repository base containing a regular `.ki-config.toml`; without a selector, only the current working directory is considered. The host requires explicit dependencies, resolves operations from verified harnesses, and uses stable topological order with prerequisites first and independent capabilities ordered by canonical name.

Native operations are imported in process only after harness and inventory validation. `ki repo audit` is read-only. `ki repo conform` validates every proposed path against its declared scope, honours dry-run, publishes each approved file atomically, and re-audits whenever it stages a change. Repository operations never dispatch `.ki/bin`, `.ki/bootstrap`, copied `govern.ts`, package-script aliases, or an ad-hoc child process. Local harness development is an explicit, verified projection under `ki dev`, never an unregistered repository-operation fallback. Legacy state is an explicit fail-closed migration input only.

Local development records an independent physical checkout for any Harness already present in the installed estate. Activation substitutes each selected Harness's complete active root, so its metadata and payloads have one local source; deactivation restores the same configured verified release as the complete active root. An optional Harness ID selects one source, while omitting it applies the transition to all recorded sources. A physical installed root containing linked payload roots is invalid. The canonical Harness alone retains its bootstrap-capability requirement.

The only repository-authored native provider is an explicitly declared `ki-self` at the exact physical `.agents/skills/ki-self/` path beneath the selected physical repository root. The host validates that source and its catalogue before import, reports it as `repository-local:ki-self`, and excludes it from Harness upgrade and managed runtime projection. Every other declared skill still resolves only through a declared installed Harness.

## Consequences

- `tools-ki` is the sole owner of registry layout, command grammar, physical repository resolution, reporting, activation, migration, and native execution.
- The base harness and an organisation harness can coexist without merging their source trees or treating either checkout as installed state.
- A prefix collision is resolved by choosing one Harness; repository configuration does not carry a provider-disambiguation syntax.
- A private GitHub harness can use the user's existing GitHub CLI authentication without placing a token in KI configuration or sending it to another host.
- User commands do not resolve the CWD, while every `ki repo` command can discover one repository or use an explicit override.
- Release and Homebrew delivery remain separate from harness registration and do not authorise a tag, publication, or push.
- Repository-local governance remains mutable with its owning repository without becoming a portable provider, activation source, or general local-code execution path.

## References

- [ADR-KI-TOOLS-001](ADR-KI-TOOLS-001-typescript-native-command-host.md) — the TypeScript-native executable host.
