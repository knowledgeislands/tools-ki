---
id: KI-TOOL-CLI-115
area: CLI
title: Refuse host roadmap writes
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-08T07:24:10Z
updated_at: 2026-10-08T07:27:50Z
---

# Refuse Host Roadmap Writes

## Goal

`ki` refuses every roadmap write - identifier reservation, capture, lifecycle transition, acceptance and prune - when it runs on a machine carrying the agent-host marker, so host sessions cannot fork a repository's roadmap history.

## Context

[ODR-KI-ARCADIA-001](https://github.com/knowledgeislands/ki-arcadia-principal/blob/a94b76c/Admin/Governance/Decisions/ODR-KI-ARCADIA-001-keeping-work-safe-on-the-agent-host.md), "Keeping work safe on the agent host", designates the Mac checkout as the roadmap writing checkout for every Knowledge Islands repository. The agent host carries a marker that `ki` honours by refusing roadmap writes there, and host sessions report the roadmap changes they need for a Mac session to write. Its Consequences record that `tools-ki` gains the host-marker refusal.

The `ki-work-roadmap` standard already requires every roadmap write to be serialised through one designated writing checkout per repository, because two checkouts that each commit a ledger advance reproduce the identifier collision one merge later. Until this refusal exists, the rule sits only in the host's rendered instructions. The [durability report](https://github.com/knowledgeislands/ki-arcadia-principal/blob/a94b76c/Streams/Projects/agent-host/design/agent-host-durability-report.md) has `converge.sh` in `ki-techne-harness` set the marker.

## Boundary

- **In:** detecting the marker; refusing the roadmap write paths in `ki` with a clear message naming the writing checkout; tests for refusal and for the unmarked path.
- **Out:** setting the marker, owned by `ki-techne-harness` (TECHNE-TOOLS-OPS-014); where a designated writing checkout is declared in general, a `ki-agentic-harness` handoff (KI-HARNESS-GOV-157); any remote-history serialisation design.

## Discussion

- Marker shape and location are not yet fixed: a file such as `~/.config/ki/host-marker`, an environment variable, or both. Agree it with the harness record that sets it before planning.
- Should the refusal cover only `ki`'s own write commands, or also expose a check that skills can call before a hand-written roadmap edit?
- If KI-HARNESS-GOV-157 later declares designations per repository, the refusal may generalise from a host marker to "not the designated checkout".
