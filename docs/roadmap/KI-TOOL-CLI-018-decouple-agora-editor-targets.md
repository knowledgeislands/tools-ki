---
id: KI-TOOL-CLI-018
title: Normalize Agora estate
theme: cli
horizon: now
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 0db2f8acdb739c07a0da83b2e1d23cf1816b4c17
---

## Goal

Make an Agora a neutral named set of canonical KI repositories, with one system-managed canonical Agora representing the registered estate. It must not persist an editor or other opening tool as part of that collection's identity.

## Context

The current `.ki-agora` format requires `tool = "zed"`, accepts arbitrary physical directories, and keys them only by their directory basename. `ki agora open` consequently has one hard-coded integration. That model cannot express the registered KI estate safely: membership needs a human-friendly local repository key and the declared canonical HTTPS repository identity, while an external source store or archived checkout is not itself a canonical KI repository.

The registry remains a first-class CLI surface, but its membership is the canonical system-managed Agora rather than a second collection model. The local key is the repository name used by local tools and mGit; the full canonical HTTPS home remains the identity used for validation and trades.

Tool workspaces are a separate layer. A VS Code, Zed, or later target can assemble one or more canonical repository members with declared non-repository stores such as `sources` and `legacy`, without making those stores registered KI repositories.

## Boundary

This item does not define the portable `ki-repo` contract for repository kind and KB store roles, create every tool target, or make non-repository stores eligible for `ki repo` operations. It consumes the agreed contract in the CLI, establishes that no editor target is stored in `.ki-agora`, and retains the registry as the first-class management surface for the canonical estate. The first target boundary requires `--target zed`; it introduces no global or profile-stored default.

## Current state

Agora profiles currently require `tool = "zed"` and store arbitrary physical directories under basename-derived keys. The user configuration holds a separate unkeyed registry path list.

The Harness-owned reciprocal Agora-membership contract was accepted as `GDR-KI-HARNESS-006` in Harness commit `ba50fb64`. This CLI may now resolve registered canonical identities and observe matching home/member declarations. It still must not alter peer `.ki-config.toml` files, treat current local profiles as portable membership evidence, or choose the initial Agora vocabulary and member set without user approval.

The accepted `ki-repo` contract makes an ordinary repository implicit when `repo_type` is omitted. A Knowledge Base declares `repo_type = "kb"` and `store_roles`, whose closed vocabulary is `notes`, `sources`, and `legacy`: `notes` names the selected repository itself, while the optional external roles are stable names rather than paths or local bindings. `KI-HARNESS-GOV-015` was accepted in Harness commit `445330a6836e429d603059410481f97fd921593a`, is reachable from Harness `origin/main`, and no later `ki-repo` change alters this model.

The verified canonical Harness archive is pinned to `445330a6836e429d603059410481f97fd921593a` with SHA-256 `9d395e9b35748f7cbb26b93f96407ab407d166d2d4e2fbc8519781585ee2692c`. Its `ki-repo` standard preserves the model above: omitted `repo_type` is an ordinary repository, `repo_type = "kb"` is the only specialised kind, and `store_roles` is the closed `notes`, `sources`, and `legacy` vocabulary. Normal canonical acquisition can therefore provide the contract this migration consumes.

## Steps

- [x] Pin and verify the canonical Harness archive containing the accepted `ki-repo` contract.
- [ ] Reconcile the implicit ordinary-repository model and KB `store_roles` into typed repository configuration, resolution, and validation.
- [ ] Replace the separate registry path list with a protected canonical Agora derived from registered members, each carrying a local repository-name key and canonical HTTPS identity.
- [ ] Restrict persisted named Agoras to canonical estate members, diagnose name and identity collisions, and retain registry commands as the first-class estate-management interface.
- [ ] Remove `tool` and physical project paths from `.ki-agora`; require `ki agora open <agora> --target zed` at the target boundary, where Zed composes repository members and declared stores.
- [ ] Migrate configuration, CLI contracts, completions, manual, README, changelog, and contract tests without compatibility aliases.

## Files touched

- `src/core/registry.ts`, `src/core/agora.ts`, `src/core/configuration.ts`, `src/core/repository.ts`, and repository-resolution modules.
- `src/commands/agora/`, `src/commands/registry/`, and the target-boundary command module.
- `src/tests/cli/agora/agora.test.ts`, `src/tests/cli/registry/registry.test.ts`, bootstrap, repository-target, and trade contracts.
- `man/ki.1`, `README.md`, `CHANGELOG.md`, and shell completion coverage.

## Verify

- A canonical registered estate round-trips repository-name keys, canonical HTTPS identities, and physical roots without accepting an arbitrary project as a repository member.
- `ki registry` adds, lists, diagnoses, and repairs that estate, while `ki repo --agora <name>` resolves only its canonical members.
- No `.ki-agora` form contains `tool` or a physical project path. `ki agora open <agora> --target zed` resolves the target outside the profile and can compose a KB's declared `notes`, `sources`, and `legacy` roles without registering the latter two as KI repositories or storing their physical bindings in repository configuration.
- The verified canonical archive retains the accepted `ki-repo` kind, role, and authority rules recorded above; a later archive refresh that changes any of them requires a revised plan.
- Full CLI contract tests retain 100% coverage and documentation, completion, TypeScript, and formatting checks pass.

## Dependencies / blocks

The portable `ki-repo` kind and store-role contract is accepted and available in the pinned Harness archive. `KI-HARNESS-GOV-033` accepted the reciprocal home/member contract in `ba50fb64`. User approval of the initial Agora vocabulary and member set remains the publication gate for consumer configuration, Dotfiles projections, and all peer-repository declarations.

## Discussion

### Canonical estate

The system-managed canonical Agora represents every locally registered canonical KI repository, whether it is a Knowledge Base or a non-KB repository. Registry commands retain their responsibility to add, list, diagnose, and repair this estate. Named Agoras select canonical repository members rather than arbitrary physical directories.

Each member needs a local repository-name key for user-facing configuration and integration with mGit, alongside its declared canonical HTTPS home. A name collision must be diagnosed rather than silently replacing a different canonical repository identity.

### Reciprocal membership authority

`ki-agentic-harness` owns the portable reciprocal-membership contract because it governs declarations that must agree across repositories. `tools-ki` owns only the local resolver and validator that maps registered canonical identities to physical roots and checks the two declarations. The unresolved Harness item is therefore a real prerequisite, not an implementation detail that this CLI may choose unilaterally.

### Editor targeting

The profile format should retain only profile identity, display metadata, and project membership. The implementation must remove the `tool` attribute from generated, parsed, rendered, documented, and tested profile forms.

The opening operation uses `ki agora open <agora> --target zed` in its first implementation. A missing or unsupported target fails clearly; a global default is deliberately deferred so target selection cannot leak back into the profile model.

### Tool workspace composition

An editor or other target composes its workspace from canonical repository members and their declared store roles. For a Knowledge Base, `notes` is its self-reference, while optional `sources` and `legacy` roles identify externally bound stores. The tool layer decides whether and how to resolve and open those role bindings, including ordering and read-only treatment; it must not write machine paths into tracked repository configuration or make an external store a canonical KI repository.

The portable definition of repository kind and store roles belongs to the `ki-repo` contract. This CLI item must not invent a private alternate schema.

### Final contract check

The verified `445330a6836e429d603059410481f97fd921593a` archive was compared with the model recorded here. Its kind, named-store, and authority rules match; re-plan rather than silently proceeding if a future selected archive changes them.
