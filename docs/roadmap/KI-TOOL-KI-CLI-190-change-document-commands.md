---
id: KI-TOOL-KI-CLI-190
area: CLI
title: Change document commands
priority: medium
size: l
assignee: work/ki.tools
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-26T02:47:03Z
updated_at: 2026-11-26T02:47:03Z
---

# KI-TOOL-KI-CLI-190: Change document commands

## Goal

`ki work` writes change documents in the change format's shape, adding and ticking steps, raising, answering and clearing questions, and setting a package's Now, so that sessions stop hand-editing them with one-off scripts.

## Context

Kris asked for this on 22 November 2026, about 08:30 GMT (KI-STEPS, relayed by Bastion through Loreward): a `ki work` veneer with commands such as `ki work step add`, `tick`, `answer`, `query raise` and `clear`, and `now set`. "If the KI tool can help with that, that's great ... at the minute it's a massive single set of scripts." His first step for it is to see the command model and sanity-check it before anything is built ([ki.tools at 9cb97bd6](https://github.com/krisb/ki-cairn-store/blob/9cb97bd64b108d11b9fc7e10c009562c57188c02/work/ki/ki.tools/_index.md)). Captured as triage from the ki.tools reset map ([4.4](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#44-now-and-held), N5).

## Boundary

- **In:** the command model for writing change documents and a package's state, put to Kris first, then the commands he agrees.
- **Out:** the change format and the work-package standard themselves, which the backpack owns; `ki`'s wider command surface and its split into tools, which ki.summit's Tools veneer (12) carries.

## Dependencies / blocks

The command model goes to Kris before any build. Its place in `ki`'s command surface follows ki.summit's Tools veneer (12) once that settles.

## Discussion

### Open questions

- **KI-STEPS: the command model.** Which commands, their names and what each writes, for Kris's sanity check before implementation. Not yet drafted.
