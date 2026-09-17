---
id: KI-TOOL-CLI-075
area: CLI
title: Align website tool routes
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T21:05:16Z
updated_at: 2026-09-17T21:05:16Z
---

# KI-TOOL-CLI-075: Align website tool routes

## Goal

Make `ki manage docs overview` print a live website address again, and adopt the registry handoff that keeps the website's advertised `ki` version matching what this repository has released.

## Context

`knowledgeislands/ki-website` delivered `KI-WEB-SITE-007`, which gives every released Knowledge Islands tool the same two public routes: `/tooling/<tool>/` for people and `/install/<tool>` for machines. Both are generated from one website-owned registry.

That retired two routes this repository depends on. `/tooling/cli/` is now `/tooling/ki/`, and `/harness/install` is now `/install/ki`. No compatibility alias was kept, which was the website item's explicit instruction.

`ki manage docs overview` still prints `https://knowledgeislands.info/tooling/cli/` as of `v0.3.6`. That address is dead, so the command now hands a user a 404.

The website's `/install/ki` endpoint redirects to this repository's `install.sh` at an immutable release tag, currently `v0.3.6`. Advancing that declaration is a release follow-up owned here, not something the website discovers.

## Boundary

This does not move release authority, installer behaviour, artifact hosting, or checksum verification to the website. The website is an indirection layer over what this repository publishes.

This item does not redesign the `ki manage docs` command surface; it corrects one printed string and adds a release step.

## Discussion

### The printed address

`ki manage docs overview` should print `https://knowledgeislands.info/tooling/ki/`. Check whether `ki manage docs site`, `manual`, and `roadmap` carry any other website-derived address that moved.

### The release handoff

After publishing a release intended for general recommendation, hand `ki-website` an item naming the exact version and the immutable installer target `https://raw.githubusercontent.com/knowledgeislands/tools-ki/<version>/install.sh`. The website updates its registry entry and ships; nothing advances on its side until that handoff arrives, which is deliberate.

The website verifies declared routes before deployment and reports upstream drift as a warning, so a release that has not yet been handed over is visible rather than silently followed.

### Related

Originating repository and item: `knowledgeislands/ki-website` `KI-WEB-SITE-007`. That item is done; this one does not block it. The route contract is documented at `docs/guides/tool-routes.md` in that repository.

`KI-TOOL-CLI-076` covers the separate installer version-pinning interface question.
