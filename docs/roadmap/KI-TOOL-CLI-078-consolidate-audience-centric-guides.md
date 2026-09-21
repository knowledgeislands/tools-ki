---
id: KI-TOOL-CLI-078
area: CLI
title: Consolidate audience-centric guides
theme: documentation-structure
blocks: []
blocked_by: []
transferred_from: ki-website
created_at: 2026-09-21T15:44:00Z
updated_at: 2026-09-21T16:12:00Z
horizon: now
status: draft
---

## Goal

The guide collection is complete and stable enough that another repository can cite individual guides at a pinned tag without the path moving underneath it.

## Context

`tools-ki` already splits `docs/guides/` into `user/` and `developer/`, so the structure is right. What this item asks is whether the collection is complete, and whether its paths are now stable.

The layout has moved recently, and it broke a downstream citation. At `v0.4.0` the user guides sat flat at `docs/guides/<name>.md`; they are now under `docs/guides/user/`. KI Website links several of them at `v0.4.0`, and those pinned links still resolve — but its provenance sweep reports that `docs/guides/vscode-management.md` no longer exists on the default branch, because it moved rather than changed. A move is indistinguishable from a deletion to anything reading the old path.

KI Website now declares, for every page it publishes under `apps/site/src/guidance/`, the exact upstream document and pinned ref that page was written from, and a `verify:guidance --network` sweep reports the pages whose source has moved. The site intends to derive public guidance for this project from this repository's own guides and cite them at a pinned ref, so the quality and stability of `docs/guides/` here directly determines the quality of what the site can publish.

That is a pull, not an obligation: KI Website derives, it does not own. This repository decides what its guides say and when they change.

Separately, `ki-guides` is being asked to require audience directories under `docs/guides/` rather than permitting a flat collection (`ki-agentic-harness` `KI-HARNESS-GOV-083`). If that lands, this repository's collection has to satisfy it.

## Boundary

Adopted into `Now` by explicit approval, so this is prioritised work rather than intake. It remains `status: draft`: `ki-plan` shapes it to `Ready` before any implementation, and this repository still owns its plan and sequencing.

KI Website derives and cites; it does not own this collection. A guide that would not serve this repository's own readers should not be written for the site's benefit.

## Shaping

- Review whether every `user/` guide a reader needs exists, and whether anything practical still lives only in the README, `man/ki.1`, or `docs/specs/`.
- Decide whether the flat-to-`user/` move warrants a note in the next release's changelog. A downstream repository pinning a path has no other way to learn a document moved.
- Consider whether `man/ki.1` and the user guides can disagree, and which is authoritative when they do.
- Confirm the collection index routes each audience before anything else, and run `ki repo audit --skill ki-guides --repo .`.

## Discussion

Shaping settles how far consolidation goes, not whether it happens. The prompting question is whether every practical document in this repository is in the guide collection, under the audience that needs it, and reachable from the collection index.
