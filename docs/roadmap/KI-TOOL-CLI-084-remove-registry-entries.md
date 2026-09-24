---
id: KI-TOOL-CLI-084
title: Remove registry entries
area: CLI
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
transferred_from: 5g-emerge-phase2
baseline_ref: null
created_at: 2026-09-24T11:05:00Z
updated_at: 2026-09-24T11:05:00Z
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

## Discussion

### Why not just keep editing the file

Because the edit is unverifiable. `registry.toml` has no validation command, and a malformed edit degrades governance checks across the estate silently. Hand-editing the input to those checks, with no way to confirm the edit was well formed, reads as harmless every time until the once it is not.

### Why remove-and-add rather than a rename command

A dedicated `rename` would have to decide what a rename means — the key, the path, the URL, or all three — and would carry that guess in its interface. `remove` then `add` composes: the caller states the new truth explicitly, and `add` already knows how to derive a key and validate a repository root. It is also the smaller request.

### Provenance

Raised from `DBR-HK-016` in `5g-emerge/5g-emerge-phase2`, which carries the original evidence and stays open until this lands, at which point it confirms the rename path end to end against a scratch entry.

Written directly into this repository rather than submitted as a work trade, because `.ki.toml` declares no inbound work route from `5g-emerge-phase2` and a trade from there would sit in `submitted` and never arrive. `KI-HARNESS-GOV-090` carries that routing problem.
