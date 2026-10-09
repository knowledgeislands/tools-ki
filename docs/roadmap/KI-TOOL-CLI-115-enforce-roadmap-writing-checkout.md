---
id: KI-TOOL-CLI-115
area: CLI
title: Enforce roadmap writing checkout
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-08T07:24:10Z
updated_at: 2026-10-09T21:02:38Z
---

# Enforce Roadmap Writing Checkout

## Goal

`ki` refuses every roadmap write - identifier reservation, capture, lifecycle transition, acceptance and prune - when it runs on a machine carrying the agent-host marker, so host sessions cannot fork a repository's roadmap history. It also settles where a repository's designated roadmap writing checkout is declared, so the refusal can generalise from the host marker to any checkout that is not the designated one.

## Context

[ODR-KI-ARCADIA-001](https://github.com/knowledgeislands/ki-arcadia-principal/blob/a94b76c/Admin/Governance/Decisions/ODR-KI-ARCADIA-001-keeping-work-safe-on-the-agent-host.md), "Keeping work safe on the agent host", designates the Mac checkout as the roadmap writing checkout for every Knowledge Islands repository. The agent host carries a marker that `ki` honours by refusing roadmap writes there, and host sessions report the roadmap changes they need for a Mac session to write. Its Consequences record that `tools-ki` gains the host-marker refusal.

The `ki-work-roadmap` standard already requires every roadmap write to be serialised through one designated writing checkout per repository, because two checkouts that each commit a ledger advance reproduce the identifier collision one merge later. Until this refusal exists, the rule sits only in the host's rendered instructions. The [durability report](https://github.com/knowledgeislands/ki-arcadia-principal/blob/a94b76c/Streams/Projects/agent-host/design/agent-host-durability-report.md) has `converge.sh` in `ki-techne-harness` set the marker.

## Boundary

- **In:** detecting the marker; refusing the roadmap write paths in `ki` with a clear message naming the writing checkout; tests for refusal and for the unmarked path.
- **In:** where a designation is declared (estate-wide, per repository in `.ki.toml`, or per machine) and how `ki` and skills read it; a recommendation on whether a remote-history serialisation design, in which the remote's `main` is the single roadmap history, is worth opening.
- **Out:** setting the marker, owned by `ki-techne-harness` (TECHNE-TOOLS-OPS-014); the `ki-work-roadmap` standard text the declaration needs, which `ki-agentic-harness` owns and receives through a `ki-trades` work trade; the two-checkout rule in personal instructions (chezmoi DOTFILES-UE-072); designing the remote-history serialisation itself, and any change to the Arcadia Decision Record that bounds pushes, which only Arcadia's Enactment Process can make.

## Discussion

- Marker shape and location are not yet fixed: a file such as `~/.config/ki/host-marker`, an environment variable, or both. Agree it with the harness record that sets it before planning.
- Should the refusal cover only `ki`'s own write commands, or also expose a check that skills can call before a hand-written roadmap edit?
- If designations are declared per repository, the refusal may generalise from a host marker to "not the designated checkout".
- An estate-wide default with per-repository override would cover the Mac designation in one line; is per-repository declaration ever needed?
- Is a per-machine marker (as on the agent host) a designation, or only an exclusion?
- The [durability report](https://github.com/knowledgeislands/ki-arcadia-principal/blob/a94b76c/Streams/Projects/agent-host/design/agent-host-durability-report.md) records both reviewers' view that a remote-`main` design needs its own approval, because a standing push breaks the bound that pushes happen only when asked, and that ledger-only commits can still be dropped on rebase.
- Merged on 2026-10-09 with Kris's approval (state-of-play decisions log, Decision 21): this record absorbed `ki-agentic-harness` KI-HARNESS-GOV-157 (Declare roadmap writing checkout), cancelled there as merged into this record, because `tools-ki` owns the enforcing behaviour. Cross-repository link: [KI-HARNESS-GOV-157](https://github.com/knowledgeislands/ki-agentic-harness/blob/c694086d7a7057e63b0389ee5c2a60df4e9b854b/docs/roadmap/KI-HARNESS-GOV-157-declare-roadmap-writing-checkout.md), pinned to its cancelled state; the harness keeps the `ki-work-roadmap` standard change.
