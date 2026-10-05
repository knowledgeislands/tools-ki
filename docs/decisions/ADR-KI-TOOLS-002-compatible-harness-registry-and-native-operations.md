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

The native `ki` host supports compatible Harnesses alongside its required canonical Harness. Installation trust, capability identity, user activation, repository activation, and repository-owned governance are distinct concerns; conflating them weakens ownership and execution boundaries.

## Decision

`ki` separates verified installations and configuration from disposable acquisition material, locks, and mutable state using standard XDG paths. The canonical `knowledgeislands/ki-agentic-harness` remains registered and required.

Installation validates immutable acquisition evidence, checksum, declared lowercase alphanumeric Harness prefix, and capability inventory before atomic replacement. Every published skill uses its Harness prefix; two installed Harnesses cannot claim the same prefix. Repositories declare bare skill names and their providing Harnesses in `[repo].harnesses`.

Private GitHub archives explicitly opt into `auth = "github-cli"` with a matching commit-pinned codeload URL. Only this form obtains a local GitHub CLI token for a no-redirect request. Tokens are never stored, printed, embedded in URLs, or sent to another host; public acquisition remains unauthenticated.

Harness installation, updates, and removal preserve activation. `ki skill add|remove` owns user projections; `ki repo skill add|remove` owns repository declarations and projections. User inventory does not resolve a repository. Removal requires ownership proof and cannot remove the canonical Harness.

Repository operations resolve shared explicit repository or Agora selectors, or the supported direct-CWD mGit manifest before ordinary discovery. Every selected target is a physical repository with a regular `.ki.toml`. Verified providers and explicit dependencies determine stable prerequisite-first order.

Native operations import only validated catalogues. Audit is read-only; conform checks declared write scopes, supports preview, publishes guarded atomic writes, and re-audits changes. The host never falls back to repository-vendored runners, copied governance wrappers, package-script aliases, or arbitrary child processes.

Harness development explicitly substitutes a verified physical checkout as the complete active root; deactivation restores its configured verified release. Each installed Harness has independent source selection. Linked payload roots are not valid installed roots, and the canonical Harness retains its bootstrap-capability requirement.

One explicitly declared repository-local `ki-self` provider may live at the exact physical `.agents/skills/ki-self/` path. It is validated before import, reported separately, and excluded from Harness upgrades and managed projections. All other declared skills resolve through declared installed Harnesses.

## Consequences

- The executable host owns selection, registry layout, activation, migration, reporting, and native execution.
- Compatible Harnesses coexist without merging sources; prefix collisions require choosing one provider.
- Installation, user activation, repository activation, and local governance retain separate authority.
- Verified development projections do not become arbitrary local-code execution fallbacks.
- Release, Homebrew distribution, pushing, and publication retain their separate approval boundaries.

## References

- [TypeScript-native command host](ADR-KI-TOOLS-001-typescript-native-command-host.md) — executable-host ownership.
