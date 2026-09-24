---
id: KI-TOOL-CLI-085
area: CLI
title: Contain the guide collection
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: null
created_at: 2026-09-24T19:55:00Z
updated_at: 2026-09-24T22:48:00Z
---

## Goal

`docs/guides/` reads completely without following a link, so the collection can be moved, published or handed to a reader as a unit. `ki repo audit --skill ki-guides --repo .` passes.

## Context

`ki-guides` adopted a containment rule on 2026-09-24: a guide MUST read completely without following any link, mirroring the requirement a Decision Record has carried all along and for the same reason. The line is prose documents against code — a path to a script, a directory or a configuration key names the subject a guide explains and stays; a link to another Markdown document outside the collection is where the explanation went missing. Sibling guides are the exception the collection is navigated by. It is mechanical as `GUIDE-4`, and graded by audience as the judgment item `ROUTE-3`.

This repository now fails it eighteen times. Sixteen links point into `docs/specs/`, one into `docs/decisions/`, and one more from `docs/guides/developer/releasing.md` to `PDR-KI-TOOLS-001`.

Fifteen of the eighteen are in `docs/guides/user/`, which is where `ROUTE-3` bites hardest. That item holds a guide written for somebody using what the repository produces to a tighter standard than one written for somebody working in it: the first reader has the product, not `docs/specs/` and not `docs/decisions/`, so naming a specification cites something they cannot open and did not ask about. A developer guide may name `PDR-KI-TOOLS-001`; a user guide should not be sending a reader to `specs/bootstrap.md` at all, because the guide is where the answer is supposed to be.

The three `docs/guides/developer/` findings are the lighter case — `local-development.md` twice and `releasing.md` once — where the citation is legitimate and only the link has to go.

## Boundary

This item removes the links and states the substance in their place. It does not delete a citation a developer guide is entitled to make, and it does not move material into `docs/guides/references/` unless a guide genuinely needs a supporting document rather than a sentence.

It does not change `docs/specs/`, which is the authority being cited and is not a guide collection.

Whether this lands inside `KI-TOOL-CLI-078`, which is already consolidating this collection, or separately, is that item's call. The two overlap on nearly every file and should not run concurrently.

## Current state

`ki repo audit --skill ki-guides --repo .` reports exactly eighteen `GUIDE-4` failures: sixteen links into `docs/specs/`, one into `docs/decisions/`, and one additional decision-record link from the release guide. The collection otherwise has its required root, entry point, audience routes, and H1s.

## Steps

- [ ] Remove every Markdown link from `docs/guides/` to a document outside the collection while preserving code-path references and sibling-guide links.
- [ ] In user guides, state the operational substance already owed to the reader and remove internal governance citations that reader cannot reach.
- [ ] In developer guides, retain legitimate specification or decision identifiers as unlinked names where they help a contributor locate repository authority.
- [ ] Keep command grammar reachable through the installed `ki --help` and `man ki` interfaces without linking the tracked manual file.
- [ ] Run the guide containment audit, inspect the audience-sensitive `ROUTE-3` judgment, and apply the Markdown authoring gate once after the complete edit batch.

## Files touched

The guide files named by the eighteen audit findings and this record. `docs/specs/` and `docs/decisions/` remain unchanged.

## Verify

Run `ki repo audit --skill ki-guides --repo .`, `ki repo audit --skill ki-authoring --repo .`, and the full repository audit. Confirm no Markdown link below `docs/guides/` resolves outside that collection and every user guide still states the behaviour needed to complete, verify, and recover its procedure.

## Dependencies / blocks

Deliver after `KI-TOOL-CLI-083`, which records the local opening and link-label judgments in the same guide entry point. Completion makes the existing `KI-TOOL-CLI-078` review evidence current again.

## Documentation impact

### Decision Records

None. Existing rationale remains named where a developer can reach it; no decision content moves.

### Specifications

No specification changes. The accepted behaviour remains in `docs/specs/`; guides state only enough operational substance to stand alone.

### Guides

This item is entirely a containment correction across the current collection.

### Roadmap

After this passes, recheck `KI-TOOL-CLI-078` for acceptance rather than reopening its completed delivery.

## Discussion

### Why the user guides are the real work

A user guide that links `specs/bootstrap.md` has not cited a decision; it has outsourced an explanation. Removing the link exposes whether the guide ever said what it owed its reader, and in some cases the honest fix will be several paragraphs rather than a name. That is the rule doing what it is for, and it is why this is worth an identifier rather than a sweep.

### Origin

`knowledgeislands/ki-website`, `KI-WEB-SITE-027` and `KI-WEB-SITE-035`. The website adopted the same standard against its own collection the day it landed — eleven findings, all citations that survived as names, because its guides are maintainer documentation. This collection is a harder case because most of it is written for users. Non-blocking in both directions.
