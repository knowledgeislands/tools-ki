---
id: KI-TOOL-KI-CLI-189
area: CLI
title: Prune-due and source checks
priority: low
size: m
assignee: work/ki.tools
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-26T02:47:03Z
updated_at: 2026-11-26T02:47:03Z
---

# KI-TOOL-KI-CLI-189: Prune-due and source checks

## Goal

`ki repo audit` carries the two mechanical checks the Skills guild left to tools-ki: one host warning for each terminal record due for the standing prune (`ki-work:standing-prune-due`), and the resolved backpack source, development or released, printed in the audit header (`ki-keystone:dev-local-visible`).

## Context

Gilder's mechanical checks inventory, ki.guilds' [Mechanical checks inventory (30)](https://github.com/krisb/ki-cairn-store/blob/e4ad840d2be0778a344b963da44a115aadfce32c/work/ki/ki.guilds/30-mechanical-checks-inventory.change.md), turns prose rules into checks. Checks 1 to 5 are the backpack's; checks 6 and 7 are tools-ki's alone and need no skill change. Check 6 calls `evaluateStandingPrune` and emits one host WARN per due record (size M); check 7 prints the backpack source the audit resolved (size S). ki.guilds offers them to ki.tools through Loreward at its step 4 (CHECKS-BATCH, received 23 November 2026 in the estate round's fifth item). Captured as triage from the ki.tools reset map ([4.4](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#44-now-and-held), N4).

## Boundary

- **In:** checks 6 and 7 as the inventory sets them, and the optional shared evidence item 2 offers (the tracked-file list for `ki-engineering:env-files-ignored`) if planning takes it.
- **Out:** checks 1 to 5, which land in the backpack.

## Dependencies / blocks

Check 6 waits on ki.guilds' PRUNE-RECURRING, which decides whether finished recurring runs are exempt from the standing prune; if they are, the check exempts them too.

## Discussion

Captured as triage for Kris to adopt or cancel.
