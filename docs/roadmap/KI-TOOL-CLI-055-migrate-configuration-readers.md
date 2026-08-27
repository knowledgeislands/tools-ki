---
id: KI-TOOL-CLI-055
title: Migrate configuration readers
area: CLI
theme: cli
horizon: waiting-for
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Migrate the `ki` CLI to the accepted `.ki.toml` repository declaration and `.mgit.toml` workspace contract, removing its legacy filename assumptions and aligning repository discovery with the owning tools.

## Context

The CLI currently treats `.ki-config.toml` as the repository marker. Its mGit integration separately reads workspace membership from a direct-CWD `.mgit-config.toml`, although current mGit implementation and documentation place that information in `.mgit-workspace.toml`. The rename is therefore also an opportunity to remove a real cross-tool contract drift rather than perpetuating it behind a new filename.

The Harness owns the portable KI repository declaration, and mGit owns its workspace and repository schema. `tools-ki` should consume those accepted contracts rather than decide them locally.

## Boundary

This item owns CLI constants, discovery, initialization, diagnostics, migration commands or actions, documentation, manuals, and tests needed to consume `.ki.toml` and `.mgit.toml`. It does not define either upstream schema, rename the user-level `$XDG_CONFIG_HOME/ki/config.toml`, or perform an estate-wide repository or Chezmoi migration without separate authorization.

## Discussion

### Return trigger

Resume when both external contracts are accepted: `MGIT-CLI-004` in `tools-mgit` has fixed the versioned `.mgit.toml` workspace and repository schema, and `KI-HARNESS-FND-020` in `ki-agentic-harness` has fixed the `.ki.toml` repository declaration and migration rules.

### Intended implementation

Consume the owning repositories' exact schemas and discovery semantics. Preserve direct-CWD workspace selection where that remains part of the mGit contract, keep the user-level KI configuration unchanged, and remove the legacy mGit reader rather than translating its obsolete member shape indefinitely.

### Migration

Provide explicit, reviewable migration behaviour and actionable diagnostics for legacy-only, canonical-only, and conflicting files. Do not silently choose among multiple manifests or maintain indefinite dual-read or dual-write paths. Coordinate release ordering with the Harness and mGit so a repository can move without losing the CLI's ability to identify and audit it.

### Verify

Exercise repository-root discovery, initialization, configuration loading, mGit workspace selection, migration, conflict failure, manuals, and end-to-end audit and conform entry points through the repository's focused and full TypeScript, test, and formatting gates.

### Dependencies and hand-off

The upstream identifiers are cross-repository conditions and therefore are intentionally not recorded in the local `blocked_by` array. After both are accepted, this item can move from Waiting for into the ordinary planning path. Estate rollout remains a later coordinated action, potentially using Chezmoi project threads, with one independently reviewable commit per repository.
