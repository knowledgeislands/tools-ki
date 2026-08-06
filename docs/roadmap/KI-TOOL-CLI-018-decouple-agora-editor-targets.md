---
id: KI-TOOL-CLI-018
title: Normalize Agora estate
theme: cli
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make an Agora a neutral named set of canonical KI repositories, with one system-managed canonical Agora representing the registered estate. It must not persist an editor or other opening tool as part of that collection's identity.

## Context

The current `.ki-agora` format requires `tool = "zed"`, accepts arbitrary physical directories, and keys them only by their directory basename. `ki agora open` consequently has one hard-coded integration. That model cannot express the registered KI estate safely: membership needs a human-friendly local repository key and the declared canonical HTTPS repository identity, while an external source store or archived checkout is not itself a canonical KI repository.

The registry remains a first-class CLI surface, but its membership is the canonical system-managed Agora rather than a second collection model. The local key is the repository name used by local tools and mGit; the full canonical HTTPS home remains the identity used for validation and trades.

Tool workspaces are a separate layer. A VS Code, Zed, or later target can assemble one or more canonical repository members with declared non-repository stores such as `sources` and `legacy`, without making those stores registered KI repositories.

## Boundary

This item does not define the portable `ki-repo` contract for repository kind and KB store roles, create every tool target, or make non-repository stores eligible for `ki repo` operations. It consumes the agreed contract in the CLI, establishes that no editor target is stored in `.ki-agora`, and retains the registry as the first-class management surface for the canonical estate.

## Current state

Agora profiles currently require `tool = "zed"` and store arbitrary physical directories under basename-derived keys. The user configuration holds a separate unkeyed registry path list.

The reviewed `ki-repo` contract now makes an ordinary repository implicit when `repo_type` is omitted. A Knowledge Base declares `repo_type = "kb"` and `store_roles`, whose closed vocabulary is `notes`, `sources`, and `legacy`: `notes` names the selected repository itself, while the optional external roles are stable names rather than paths or local bindings. `KI-HARNESS-GOV-015` is awaiting final review, so no compatible published release is available yet. The CLI can shape its migration against this reviewed contract, but must re-check the accepted release before it becomes Ready.

## Steps

- [ ] Re-check the accepted published `ki-repo` contract before implementation, then reconcile its implicit ordinary-repository model and KB `store_roles` contract into repository resolution and validation.
- [ ] Replace the separate registry path representation with a protected canonical Agora whose members have local repository-name keys and canonical HTTPS identities.
- [ ] Restrict named Agoras to canonical estate members, diagnose name/identity collisions, and retain registry commands as the first-class estate-management interface.
- [ ] Remove stored Zed tool state and define the explicit tool-target boundary for opening repository members and declared stores.
- [ ] Migrate configuration, CLI contracts, completions, manual, README, changelog, and contract tests without compatibility aliases.

## Files touched

- `src/core/agora.ts`, local user-configuration, registry, and repository-resolution modules.
- `src/commands/agora/`, `src/commands/registry/`, and any new tool-target command module.
- `src/tests/cli/agora/`, `src/tests/cli/registry/`, repository-target and trade tests.
- `man/ki.1`, `README.md`, `CHANGELOG.md`, and shell completion coverage.

## Verify

- A canonical registered estate round-trips repository-name keys, canonical HTTPS identities, and physical roots without accepting an arbitrary project as a repository member.
- `ki registry` adds, lists, diagnoses, and repairs that estate, while `ki repo --agora <name>` resolves only its canonical members.
- No `.ki-agora` form contains `tool`; an opening target is resolved outside the profile and can compose a KB's declared `notes`, `sources`, and `legacy` roles without registering the latter two as KI repositories or storing their physical bindings in repository configuration.
- Before Ready, compare the compatible published `ki-repo` release with the reviewed contract above and stop for a revised plan if its kind, role, or authority rules changed.
- Full CLI contract tests retain 100% coverage and documentation, completion, TypeScript, and formatting checks pass.

## Dependencies / blocks

The portable `ki-repo` contract is owned by KI Agentic Harness and is at `awaiting-review` in `KI-HARNESS-GOV-015`. Its compatible published release remains the external prerequisite before tools-ki validates repository kinds or named KB store roles. This condition cannot appear in `blocked-by`, which permits only local work-item identifiers. This record remains a `next` draft so its local migration can be shaped against the reviewed contract, but it cannot become Ready or enter an implementation batch until the release is observable and its final contract is checked.

## Discussion

### Canonical estate

The system-managed canonical Agora represents every locally registered canonical KI repository, whether it is a Knowledge Base or a non-KB repository. Registry commands retain their responsibility to add, list, diagnose, and repair this estate. Named Agoras select canonical repository members rather than arbitrary physical directories.

Each member needs a local repository-name key for user-facing configuration and integration with mGit, alongside its declared canonical HTTPS home. A name collision must be diagnosed rather than silently replacing a different canonical repository identity.

### Editor targeting

The profile format should retain only profile identity, display metadata, and project membership. The implementation must remove the `tool` attribute from generated, parsed, rendered, documented, and tested profile forms.

The opening operation needs a deliberate follow-up command grammar: it may require an explicit target such as `--target zed`, or use a separately configured default. Either design must keep that preference out of the Agora file and preserve a clear failure when no target can be resolved.

### Tool workspace composition

An editor or other target composes its workspace from canonical repository members and their declared store roles. For a Knowledge Base, `notes` is its self-reference, while optional `sources` and `legacy` roles identify externally bound stores. The tool layer decides whether and how to resolve and open those role bindings, including ordering and read-only treatment; it must not write machine paths into tracked repository configuration or make an external store a canonical KI repository.

The portable definition of repository kind and store roles belongs to the `ki-repo` contract. This CLI item must not invent a private alternate schema.

### Final contract check

Before the item enters Ready, compare the accepted compatible `ki-repo` release with the reviewed model recorded here. Re-plan rather than silently proceeding if the selected repository authority, repository kind, or named-store contract changes during Harness review.
