---
id: KI-TOOL-CLI-011
title: Register nested workspace members
theme: cli
horizon: next
status: ready
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Let `ki workspace register` discover a physical hierarchy of KI repositories and workspace containers in one post-order pass. A regular `.ki-config.toml` identifies a repository leaf; its parent workspace registers it directly and the traversal does not enter its descendants. Each non-repository container receives or refreshes a `.ki-workspace.toml` default group, and its parent registers the container as a nested workspace rather than flattening its leaves.

## Boundary

This item does not follow symbolic links, traverse beneath a repository leaf, create a workspace file inside a KI repository, alter non-default user-defined groups, add mGit group support, or change repository configuration ownership. The mGit groups candidate is independently tracked in `tools-mgit` as `MGIT-CLI-001`; neither item blocks the other.

## Current state

`ki workspace init` creates an empty schema-1 workspace configuration, and users add repository paths or patterns one at a time. A group can name only repository selectors. Repository resolution expands those selectors locally and has no representation for a nested workspace or its cycle and duplicate protections.

## Steps

1. Add `workspace register` alongside the retained empty-file `workspace init` flow. Define a versioned workspace-member representation that distinguishes direct repositories from nested workspace directories, creates a missing workspace file when needed, and updates the command surface, help, completions, and documentation coherently.
2. Implement deterministic, physical post-order registration: ignore symbolic links, stop at a regular `.ki-config.toml`, write or refresh only each container's default group while preserving its named groups, and register each finished child as the appropriate direct-repository or nested-workspace member of its parent.
3. Resolve nested workspace members recursively from the selecting workspace, using their default groups with physical containment checks, cycle diagnostics, and duplicate-repository refusal before a repository operation starts. Make `ki workspace list` use the same expansion and report each group's effective repository set rather than only its local direct-member count, followed by one concise deterministic line for every resolved repository leaf using its `ki-repo` `repo_code`, title, and description.
4. Cover registration, recursive list reporting, metadata display, and resolution through CLI-contract tests: nested containers, repository traversal boundaries, symlink exclusion, existing custom groups, deterministic output, malformed members, cycles, duplicates, and missing or malformed repository metadata.
5. Update the README and local-development guide to state the recursive registration, list, and nested-workspace selection contract.

## Files touched

- `src/commands/workspace.ts`
- `src/core/workspace.ts`
- `src/core/repository.ts`
- `src/core/configuration.ts`
- `src/tests/cli/workspace.test.ts`
- `src/tests/cli/diag.test.ts`
- `README.md`
- `docs/developer/local-development.md`
- command inventory or completion tests if the public command grammar changes

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --skill ki-roadmap --repo .`

## Dependencies / blocks

No external dependency. `MGIT-CLI-001` is a related, non-blocking cross-repository candidate: it may adopt analogous named-group selection independently, but KI workspace recursion must not wait on it.

## Discussion

### Membership model

Workspace membership needs an ordered, explicit distinction between a repository leaf and a workspace container. A nested member resolves the referenced workspace's default group relative to that workspace file, allowing each container to maintain concise local references while a root workspace selects the complete hierarchy.

### Effective inventory

`ki workspace list` must use the same nested-member expansion as repository operations. Its group summary should distinguish local membership from the resolved effective repository count, then emit one concise deterministic line for every resolved repository leaf: its workspace-relative path, whether it was direct or reached through a nested workspace, and its `ki-repo` `repo_code`, title, and description. This lets a user verify both the selected hierarchy and the identity of each repository without running an operation over it.

### Register ownership

`register` is an idempotent generated-default operation. It supplements, rather than replaces, `init`: `init` continues to create an empty configuration, while `register` creates a missing workspace file when necessary and refreshes the existing default group from the physical hierarchy. It retains every non-default group as user-owned configuration. The implementation must preflight the complete traversal and workspace configuration set before it writes, so malformed or unsafe state cannot leave a partially refreshed hierarchy.

### Cross-repository relationship

Origin: `tools-ki` workspace-registration design. `MGIT-CLI-001` is a non-blocking recipient-owned candidate in `tools-mgit`; it concerns named selection groups in mGit manifests, not KI workspace resolution.
