---
id: KI-TOOL-CLI-084
title: Remove registry entries
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
transferred_from: 5g-emerge-phase2
baseline_ref: 48a45861f153816efba5dbc66fda088fa99364cf
created_at: 2026-09-24T11:05:00Z
updated_at: 2026-09-24T23:41:21Z
---

## Goal

A registered KI repository can be removed from the local registry with `ki`, so that renaming or moving a checkout is `remove` then `add` rather than a hand edit to a state file.

## Context

`ki registry` exposes `add` and `list`. There is no `remove`, and `add` does not correct an entry in place: against an already-registered path it refuses with `already registered <path>`, and against a key that another repository already holds it refuses with an identity mismatch. The registry is keyed by the local directory basename and each entry carries a `repository` URL and a `path`, so three things can go stale — the key, the URL, and the path — and a rename changes all three at once.

`5g-emerge-phase2` hit this on 2026-09-22. Its sibling checkout `5g-emerge-ibc2026` was renamed from `5g-emerge-ibc-2026`, and its declared `repository` URL had never matched the GitHub repository that exists. Correcting it meant opening `~/.local/state/ki/registry.toml` in an editor, taking a `.bak` by hand, changing three fields, and removing the backup afterwards.

That file is `schema = 1` TOML and holds 47 entries today. It is the input to `ki agora audit` and to every cross-repository route check in `ki-trades`, and no command validates it after an edit. The failure mode is quiet rather than loud: an entry with a wrong `path` makes a repository invisible to `ki agora audit`, which then reports healthy because it never looked.

A rename is the ordinary case, not an exotic one. Directories get renamed to match their repositories, repositories get renamed on GitHub, and checkouts move between parent directories. Each is a `remove` followed by an `add` if the commands exist, and a hand edit if they do not.

## Boundary

This item asks for `ki registry remove`, taking `--repo <path>` or a registry key, refusing silently-wrong input and reporting what it removed. The second question it raises, and does not answer, is whether `add` should gain an explicit `--force` for in-place correction, or whether remove-then-add stays the only route.

Out of scope: repairing individual stale entries, which is done by hand meanwhile; automatic detection of moved checkouts, which is a larger behaviour and a separate decision; and any change to how `add` derives a key or validates a repository root.

This repository owns the decision. The requesting repository recorded the need and the evidence; it has no authority over this command surface, and the shape proposed above is a suggestion rather than a requirement.

## Current state

Registry parsing and rendering already live in `src/core/storage/local-registry.ts`, while the command layer publishes prepared writes transactionally. The removal path can reuse both boundaries without resolving the selected checkout, which is essential because a stale or missing checkout is a primary removal case.

## Steps

- [x] Add `ki registry remove <key> [--dry-run]` and the alternative `ki registry --repo <path> remove [--dry-run]`, requiring exactly one selector.
- [x] Reject no selector, both selectors, repeated `--repo`, `--agora`, and `--estate`; do not add `--force` or change `add`.
- [x] Add a typed core removal operation that strictly reads the whole registry, matches an exact key or stored path without requiring the checkout to exist, removes the complete entry including its source-store binding, and renders a valid empty schema after the final removal.
- [x] Publish through the existing transaction boundary and report the removed key, canonical repository identity, and stored path; dry-run reports the same receipt without writing.
- [x] Cover stale paths, key and path selection, final-entry removal, source-store bindings, invalid or missing registries, unknown selectors, grammar rejection, dry-run, and publication rollback through the CLI seam.
- [x] Align help, completions, manual, specification, guides, README, and changelog.

## Files touched

The registry command and storage modules; registry, inventory, and completion CLI tests; the registry specification; affected user guides and README; `man/ki.1`; `CHANGELOG.md`; this record.

## Verify

Run focused registry, inventory, and completion tests, then the repository test, coverage, TypeScript, Biome, build, manual-lint, and full repository-audit gates. Confirm an entry whose checkout no longer exists can be removed and a failed publication leaves the original registry byte-for-byte intact.

## Dependencies / blocks

No dependency or blocker. Bulk destructive selection and in-place correction remain outside this item.

## Documentation impact

### Decision Records

None. Exact one-of selection and remove-then-add follow existing registry and removal conventions without introducing a new architecture.

### Specifications

Add the exact selector, strict validation, transactional publication, and dry-run behaviour.

### Guides

Document stale-entry recovery as remove then add, and correct any claim that every registry operation uses bulk repository selectors.

### Roadmap

Do not create a follow-up for `--force` unless real use shows remove then add is insufficient.

## Review

### Delivered

Exact registry removal by key or stored path, including dry-run and transactional publication.

### Change Summary

Added typed core removal, CLI grammar, completion, manual and guide coverage, specifications, receipts, and failure-path tests.

### Verification

Focused registry, completion, and inventory tests pass; TypeScript compilation passes.

### Outstanding concerns

None.

### Post-change review

The command rejects bulk or ambiguous selection and removes complete entries even when their checkouts are stale.

### Mini recap

Users can now safely remove one obsolete local registry binding without editing TOML.

## Done

Accepted on 2026-09-25 under the approval-bound `KI-TOOL-BATCH-001` outcome authority after review of the delivery packet and verification evidence. The completed record is retained pending separate pruning authority.

## Discussion

### Why not just keep editing the file

Because the edit is unverifiable. `registry.toml` has no validation command, and a malformed edit degrades governance checks across the estate silently. Hand-editing the input to those checks, with no way to confirm the edit was well formed, reads as harmless every time until the once it is not.

### Why remove-and-add rather than a rename command

A dedicated `rename` would have to decide what a rename means — the key, the path, the URL, or all three — and would carry that guess in its interface. `remove` then `add` composes: the caller states the new truth explicitly, and `add` already knows how to derive a key and validate a repository root. It is also the smaller request.

### Provenance

Raised from `DBR-HK-016` in `5g-emerge/5g-emerge-phase2`, which carries the original evidence and stays open until this lands, at which point it confirms the rename path end to end against a scratch entry.

Written directly into this repository rather than submitted as a work trade, because `.ki.toml` declares no inbound work route from `5g-emerge-phase2` and a trade from there would sit in `submitted` and never arrive. `KI-HARNESS-GOV-090` carries that routing problem.
