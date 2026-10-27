---
id: KI-TOOL-KI-CLI-125
area: CLI
title: KI release contract
purpose: capability
project: agent-host
kind: deliver
size: m
status: draft
horizon: hold
hold:
  reason: waiting-for
  condition: An ARM host is needed
  review: 2026-11-16
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-13T22:53:48Z
updated_at: 2026-10-20T00:46:49Z
---

> **Idea, not on the roadmap.** A documented release contract for ki with per-platform archives, checksums, signing and an installer; every machine runs ki from the linked checkout and releases are deprioritised, so there is nothing to contract for now. Moved out of `docs/roadmap/` on 27 October 2026 under the roadmap sweep, with its record kept in full here so that it can return when Kris brings it back; it was `KI-TOOL-KI-CLI-125`.

# KI Release Contract

## Goal

One documented KI release contract is the canonical artefact for `ki` and the model for every other KI and personal tool: per-platform archives for darwin-arm64, darwin-x64, linux-x64 and linux-arm64, a checksum manifest, an Ed25519 signature over it, and an installer with the public key embedded. `ki` releases meet it in full, including the new linux-arm64 archive.

## Context

Handed over by `ki-principal` on 2026-10-13. On 2026-10-11 Kris Brown accepted all ten decisions of the [Rig and Techne boundary audit](https://github.com/knowledgeislands/ki-principal/blob/main/Streams/Projects/agent-host/design/rig-techne-boundary-audit.md); the plain-language summary is [Hosts, Roles and Layers](https://github.com/knowledgeislands/ki-principal/blob/main/Pillars/Engineering%20Practice/Architecture/Hosts%2C%20Roles%20and%20Layers.md). Decision 6 adopts the contract with three thin channels: the Homebrew tap for Macs, a signed-release install kind in Rig, and the installer for bootstrap. apt, AUR and Nix are deferred until an appliance fleet or an Arch workstation exists.

`ki` already ships signed archives, a manifest and `install.sh`, but `install.sh` supports only darwin-arm64, darwin-x64 and linux-x64. Without linux-arm64, Graviton instances and small ARM appliances are ruled out.

## Boundary

- In: writing the contract down where other `tools-*` repositories can adopt it; a linux-arm64 release build; the installer's platform detection; release checks and tests.
- Out: the Homebrew formula, which `homebrew-tap` owns; Rig's install kind, which `tools-rig` owns; other tools' adoption, which each repository owns; apt, AUR or Nix channels; any new publication beyond the existing release page.

## Dependencies / blocks

Not blocked. Blocks nothing today; ARM hosts wait for the linux-arm64 archive.

## Discussion

Origin: `ki-principal`, state-of-play thread, under Kris Brown's acceptance of the audit decisions. Capture only; adoption, priority and plan belong to this repository. Cutting a release stays a separate, explicitly approved action.

### Adoption

On 14 October 2026 Kris approved the state-of-play thread's triage burn-down as written, under Kris's instruction to burn the roadmap down: adopted as `deliver / Hold` until 2026-11-16. No ARM host exists and vega has been deleted; `ki` already ships signed archives for the three platforms in use. Review it with the vega rebuild. Adoption grants no planning, implementation or acceptance authority.

### Hold review on 20 October 2026

Reviewed with the vega rebuild, as the adoption note asked, under Kris's OVERNIGHT authority of 20 October 2026, answering the agent-host work's CLI125-HOLD query with option a), reviewed blind by query-review-6, which agreed. vega was rebuilt on 14 October as an x86 host, no ARM host exists or is planned, and Rig's signed-release install kind does not depend on this contract. The hold stays, its condition reduced to an ARM host being needed, with the same review date.
