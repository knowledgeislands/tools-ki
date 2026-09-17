---
id: KI-TOOL-CLI-076
area: CLI
title: Standardise installer version pinning
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T21:05:39Z
updated_at: 2026-09-17T21:05:39Z
---

# KI-TOOL-CLI-076: Standardise installer version pinning

## Goal

Agree one interface by which any Knowledge Islands installer is told to install an exact version, so a caller can pin deliberately and the website can advertise a pinned invocation.

## Context

Every released Knowledge Islands tool already accepts an explicit version. None of them agree on how.

| Tool | Interface |
| --- | --- |
| `ki` | positional `vX.Y.Z` |
| `git-almanac` | positional `vX.Y.Z`, or `GIT_ALMANAC_VERSION` |
| `mgit` | `MGIT_VERSION` only |
| `rig` | `RIG_VERSION` only |

All four default to resolving the repository's latest release at run time when no version is given.

`ki-website` now publishes `/install/<tool>` for each of these. The endpoint redirects to an installer served from an immutable release tag, so the _script_ a caller receives is fixed — but what that script installs is still whatever is latest at the moment it runs. The website advertises a version it cannot actually guarantee.

A uniform interface would close that gap without moving any authority: the website could document `curl -fsSL https://knowledgeislands.info/install/<tool> | sh -s <version>` as the pinned form, and reproducible environments could pin the same way.

## Boundary

This is an interface agreement across the four tool repositories. It does not change what any installer verifies, where artifacts live, or who may publish a release.

Do not remove the latest-release default. An unpinned `curl | sh` should keep working; pinning is the explicit opt-in.

Do not make the website compute or choose a version. It only documents the invocation.

## Discussion

### Proposed interface

A positional `vX.Y.Z` argument, because `ki` and `git-almanac` already implement it and it survives a `curl | sh -s` pipe, which an environment variable also does but less legibly. Repositories with an existing `<TOOL>_VERSION` variable can keep it as an accepted alias rather than breaking callers.

The alternative — standardising on the environment variable — is worth considering if there is a reason the positional form is awkward under any supported shell.

### Coordination

This is the lead item. Reciprocal items exist in `tools-mgit`, `tools-git-almanac` and `tools-rig`, each covering that repository's adoption alongside its website registry handoff. None of them blocks the others; the website work that depends on the outcome is tracked in `ki-website` and is deliberately not a blocker here.

### Related

Originating repository and item: `knowledgeislands/ki-website` `KI-WEB-SITE-007`, which recorded this as an outstanding concern at delivery. The route contract is documented at `docs/guides/tool-routes.md` in that repository.
