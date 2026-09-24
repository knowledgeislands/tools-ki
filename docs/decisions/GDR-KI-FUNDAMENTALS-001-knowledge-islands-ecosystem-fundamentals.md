---
id: GDR-KI-FUNDAMENTALS-001
title: 'Knowledge Islands ecosystem fundamentals'
date: 2026-09-24
status: current
decision_type_url: https://knowledgeislands.info/specifications/decision-records/gdr
decision_type: governance
shared_record: true
---

# GDR-KI-FUNDAMENTALS-001: Knowledge Islands ecosystem fundamentals

## Context

Knowledge Islands is an ecosystem of independently governed repositories. Repository shape, authority, source ownership, projection or distribution, runtime state, and participation in a working set are separate concerns; treating one as proof of another obscures where decisions and work belong. The estate therefore needs one durable routing record that remains valid as repositories are added, renamed, merged, or retired.

Some work has a natural repository owner, while estate-wide initiatives and unresolved ownership questions do not. Coordination needs a canonical home without transferring implementation, priority, release, or acceptance authority from the repositories affected. Before overall V1, repository-local contracts are authoritative within their repositories and KI Specifications does not provide active estate-wide normative contracts.

## Decision

This record separates five factorisation dimensions: repository structure; authority and responsibility; projection and distribution; runtime binding and mutable state; and repository-boundary justification. A change in one dimension does not imply a change in another.

- `ki-arcadia-principal` owns philosophy, the conceptual model, shared ecosystem governance, estate-wide initiative records, ecosystem coordination Agoras, and routing where no natural repository owner exists. Arcadia owns the question, participating set, evidence, and completion condition; an implementation becomes repository work only when its receiving owner accepts it.
- `ki-techne-principal` owns engineering discipline, architecture, and decision criteria.
- `ki-agentic-harness` owns the reusable agent-facing capabilities it publishes and generic MCP governance, binding semantics, and conformance assets. It does not contain or own executable MCP products merely because those products consume its governance.
- `tools-ki` owns generic repository host mechanics and the public `ki` command grammar. `ki-techne-harness` owns Techne execution-harness applications, controller and execution-fabric implementation, packaging, deployment, and provider adapters. `tools-techne` owns the independently released `techne` operator command.
- Each application, tool, and MCP product repository owns its executable source, behaviour, provider policy, schema, trust boundary, compatibility, tests, build identity, release, and lifecycle. `apps-observatory` owns the Observatory application and governed operator experience.
- `ki-website` owns public editorial publication; `ki-plugins` owns generated plugin packaging; `homebrew-tap` owns Homebrew formula acceptance and distribution. None acquires the authority of projected or distributed source.
- Dotfiles owns personal environment declarations, binding selection, and runtime registration. Each native provider owns its mutable native state.
- Before overall V1, `ki-specifications` is a dormant container for possible portable contracts. Repository-level specifications remain with their repository owners; no KI-wide KIP, KIS, schema, or conformance contract is an active prerequisite.

Every repository has exactly one base structure: Project or Knowledge Base. Structural overlays are composable repository-local shapes; adapters are replaceable work-tracker, provider, runtime, hosting, or implementation bindings; estate roles are the concern-scoped responsibilities in this record. Base structure, overlay, adapter, role, and code toolchain are not substitutes for one another and do not prove authority.

A separate repository is strongly presumed where content has an independent acceptance and release unit (R1), a materially distinct trust boundary (R2), or a host-mandated repository or root layout (R3). These are strong presumptions rather than an exhaustive mechanical test. Independent governance, audience, change coupling, cognitive scope, or historical continuity may justify an explicit exception. Authority alone does not establish a repository boundary.

Arcadia owns `ki-all`, `ki-fnd`, `ki-mcps`, and `ki-tools`. `ki-all` contains every governed ecosystem repository; `ki-fnd` contains the `ki-*` repository family; `ki-mcps` contains the `mcp-*` family plus the Agentic Harness and Techne Harness; `ki-tools` contains the `tools-*` family plus `homebrew-tap`, the Agentic Harness, and Techne Harness. Prefix selection defines the expected family, but every non-owner membership is explicitly materialised by Arcadia and independently, reciprocally accepted by the member. Product repositories use role `product`, the Agentic Harness uses `governance-harness`, the Techne Harness uses `execution-harness`, and `homebrew-tap` uses `distribution`. Arcadia participates automatically as owner and is not listed as its own member. Agora membership grants no source or product ownership, priority, routing, implementation, release, publication, or acceptance authority.

## Consequences

Questions route first to their natural owner. Clear bilateral work uses a direct handoff or declared trade route. Cross-estate work, ownership ambiguity, and questions without a natural home route to Arcadia, then disseminate through accepted repository-local work. Arcadia owns the question, participating set, routing, evidence, and estate roll-up; every receiver retains its planning, implementation, verification, commits, release, and acceptance. Unassigned implementation cannot become Ready until a receiver accepts it or a new repository is justified under the boundary rules.

Product, governance, distribution, projection, and runtime changes may proceed independently, provided their owners and interfaces remain explicit. Repository boundaries are justified consistently without forcing unlike products into one source unit, and dormant specifications cannot displace current repository authority.
