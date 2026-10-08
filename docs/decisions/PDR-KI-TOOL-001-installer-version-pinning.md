---
id: PDR-KI-TOOLS-001
title: 'Installer version pinning'
date: 2026-09-18
status: current
decision_type: product
decision_type_url: https://knowledgeislands.info/specifications/decision-records/pdr
---

# PDR-KI-TOOLS-001: Installer version pinning

## Context

Knowledge Islands distributes several standalone command-line tools through repository-owned shell installers and common website routes. Every installer can select an exact release, but the public interfaces differ: some accept a positional tag, while others accept only a tool-specific environment variable. The website can serve an installer from an immutable release tag without guaranteeing which tool version that script installs when the installer performs latest-release discovery.

A caller needs one visible, shell-portable way to request an exact version. Existing automated callers may already depend on tool-specific environment variables, and unpinned interactive installation remains useful for following the latest release.

## Decision

Knowledge Islands tool installers accept one optional positional exact version in the form `vX.Y.Z` as the canonical pinning interface. With no positional version they retain latest-release discovery. A repository that already exposes a `<TOOL>_VERSION` environment variable keeps it as a compatibility alias, while an explicit positional version takes precedence. Installers reject malformed versions and additional positional arguments before network access or repository-state mutation. Public pinned examples use `curl -fsSL https://knowledgeislands.info/install/<tool> | sh -s -- vX.Y.Z`.

## Consequences

- People and automation can use the same pinned invocation for every Knowledge Islands tool.
- The website documents a version chosen by the caller; it does not compute, select, or silently advance that version.
- Existing environment-variable callers continue to work in repositories that already support them, at the cost of retaining two accepted inputs there.
- Each tool repository owns its parser, validation, tests, release authority, and adoption timing.
- An unpinned installation remains convenient but intentionally does not promise reproducibility.
