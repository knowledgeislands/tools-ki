---
id: KI-TOOL-CLI-083
title: Guide opening and deferral
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: null
created_at: 2026-09-24T08:45:00Z
updated_at: 2026-09-24T22:48:00Z
---

## Goal

This repository decides, on its own evidence, whether two editorial rules KI Website now enforces on its published pages are worth adopting for `docs/guides/`: a guide opens by saying what the reader will be able to do, and no link text stands in for the content the page owes.

## Context

KI Website rewrote its published guidance this week. The corpus it started from read as a routing layer over other repositories' work — seventy links into GitHub across thirty-five pages, six of them with the literal anchor text `The full guide`, and a provenance table as the last thing on nearly every page. A reader's final impression was that the real material was somewhere else.

Two rules came out of that, both now mechanical in `apps/site/scripts/verify-guides.ts` and stated in `docs/guides/developer/project-guides.md` there:

1. **An opening claim.** Prose before the first `##`, saying what the reader will be able to do, at least 120 characters of it. A page that opens by describing itself — "this page summarises the material in X" — has told the reader nothing they can act on.
2. **No deferral in link text.** Link text may not be a hand-off phrase: `the full guide`, `see the README`, `full documentation`, `read more`, `learn more`, or a bare `here`, `docs`, `documentation`, `README`. A repository link is fine, and often right, when it cites a fact the page has already stated. It is wrong when it is the place the answer lives. The test is whether the link survives as a fact rather than as a destination — remove it, and the sentence should still say something true and useful.

Everything else in the site's contract is Eleventy mechanics — directory data bindings, permalinks, the `guides` collection, a reachability walk over built HTML — and none of it transfers to a repository whose guides are read in a Git checkout.

This is a proposal, not a requirement. KI Website has no authority over this repository's guides, and the rules were derived from one corpus under one set of pressures: a public website, where a reader who follows a link off-site is usually lost. That pressure is weaker here.

`KI-TOOL-CLI-078` is already consolidating this collection and is the natural place to apply either rule if this repository wants them. `KI-HARNESS-GOV-083` proposes audience directories under `docs/guides/`, which is a structural question rather than an editorial one; neither is revisited by this item.

## Boundary

This item asks a question and records the answer. It does not commit this repository to either rule, does not propose a gate, and does not amend `ki-guides` — if these rules are good for every repository rather than for a website, that is a `ki-guides` standard change and needs evidence from more than one corpus.

It does not restructure `docs/guides/`, which is `KI-TOOL-CLI-078`'s, and it does not touch `docs/specs/`.

Nothing here blocks KI Website. The site's gate runs against the site's own pages regardless of what this repository decides, and the site derives from these guides rather than owning them.

## Current state

The collection already avoids the listed hand-off link text, and nearly every guide opens with an actionable reader outcome. The useful distinction is editorial rather than mechanical: an opening claim improves any guide, while a blanket phrase ban would confuse descriptive links with deferral and duplicate `ki-guides` containment checks.

## Steps

- [ ] Record a repository-local editorial rule in the guide collection entry point: open each guide with what its reader can accomplish, and make every link label describe the fact or destination rather than substitute for missing content.
- [ ] Keep both rules as review judgments, not a new checker or a portable `ki-guides` amendment.
- [ ] Review every current guide opening and the proposed deferral phrases, correcting only concrete failures found in this collection.
- [ ] Verify the guide and authoring audits after the overlapping containment work in `KI-TOOL-CLI-085` lands.

## Files touched

`docs/guides/README.md` and this record. A concrete guide may change only if the review finds its opening does not state a reader outcome.

## Verify

Search the guide collection for the proposed hand-off link labels, inspect the prose before each first `##`, then run `ki repo audit --skill ki-guides --repo .` and `ki repo audit --skill ki-authoring --repo .`.

## Dependencies / blocks

No blocker. Deliver before `KI-TOOL-CLI-085` so that the containment pass preserves the local editorial wording while touching the same collection entry point.

## Documentation impact

### Decision Records

None. This is a local editorial convention with no product or architecture consequence.

### Specifications

None.

### Guides

The guide collection entry point records the two review judgments. No new mechanical gate is introduced.

### Roadmap

No follow-up is expected unless another repository supplies evidence that either rule belongs in portable `ki-guides`.

## Discussion

### Where the second rule is weaker here

A website guide that links to a README is sending the reader off the property. A repository guide that links to a sibling file is sending them four directories away in a checkout they already have open, and the reader is far more likely to be someone who wants the source. The no-deferral rule's underlying test — does the link carry a fact or a destination — still seems right, but the cost of a deferral is genuinely lower here, and a mechanical ban on the phrase `see the README` would be a poor fit for a repository whose README is a real document a reader should open.

The opening-claim rule looks more portable. It is about whether the first paragraph is worth reading, which does not depend on where the guide is read.

### Why this arrives as a record rather than a conversation

The handoff was decided when KI Website defined the contract and recorded in that item's `## Review`, which was the right place at the time and did not survive the record being accepted and pruned. It was reconstructed from a deleted file. A deferred concern that lives only inside an accepted record has a lifespan bounded by the prune, so this one has an identifier in the repository that would act on it.

### Origin

`knowledgeislands/ki-website`, `KI-WEB-SITE-027`. Non-blocking in both directions. An equivalent proposal is intended for `ki-agentic-harness`; `KI-WEB-SITE-027` owns writing it, and had not done so when this record landed because that checkout had another writer active.
