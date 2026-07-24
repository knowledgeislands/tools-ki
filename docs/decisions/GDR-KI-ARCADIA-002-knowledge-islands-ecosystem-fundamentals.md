---
id: GDR-KI-ARCADIA-002
title: 'Knowledge Islands ecosystem fundamentals'
date: 2026-07-24
status: current
type: Governance Decision Record
type_url: https://knowledgeislands.info/specifications/decision-records/gdr
decision_type: governance
---

# GDR-KI-ARCADIA-002: Knowledge Islands ecosystem fundamentals

## Context

Knowledge Islands is expressed through five primary repositories with different kinds of authority. Without an explicit shared boundary, philosophy can be mistaken for tooling, a CLI implementation can accidentally define a skill or portable standard, normative specifications can be treated as explanatory publication, and vendored website material can become an untraceable parallel source.

## Decision

The five primary repositories have distinct authority:

- `ki-arcadia-principal` is the canonical source of the Knowledge Islands philosophy and conceptual model. It develops and proves the approach without mandating a particular tooling implementation.
- `ki-agentic-harness` is the canonical source of reusable agentic capabilities and compatible harnesses. A capability is a typed published harness member: a skill, agent, MCP server, hook, eval, or future registered kind. The harness defines capability content and semantics; it does not implement the public `ki` executable or originate normative portable contracts.
- `tools-ki` is the canonical source of the `ki` executable platform. It implements harness installation, capability inventory and activation, repository resolution, registered native operation hosting, reporting, migration, and public command grammar. It consumes compatible harness artifacts but does not own their standards or define portable normative contracts.
- `ki-specifications` is the canonical source of normative portable contracts, including KIPs, KIS documents, schemas, templates, conformance rules, reference examples, and portable capability identity and inventory contracts. It formalises proven concepts and implementation evidence; an Active KIS governs implementations that claim conformance within its scope.
- `ki-website` is the autonomous public publication layer. It owns public user-guide prose and routes, and vendors source-labelled material from the other four repositories so it can build and deploy independently, but publication never transfers canonical ownership.

The authority and publication structure is:

```text
ki-arcadia-principal
|-- informs -------------------> ki-agentic-harness
|-- informs -------------------> tools-ki
|-- informs -------------------> ki-specifications
`-- publishes through --------> ki-website

ki-agentic-harness
|-- publishes compatible
|   harness and capability semantics -> tools-ki
|-- informs/validates ---------> ki-specifications
`-- publishes through --------> ki-website

tools-ki
|-- supplies implementation
|   evidence ------------------> ki-specifications
`-- publishes through --------> ki-website

ki-specifications
|-- constrains conforming -----> ki-agentic-harness and tools-ki
`-- publishes through --------> ki-website
```

`homebrew-tap` is a delivery repository for package-manager formulae, not a primary ecosystem authority. It implements the release transport owned by `tools-ki`.

This file is copied verbatim into `ki-arcadia-principal`, `ki-agentic-harness`, `tools-ki`, `ki-specifications`, and `ki-website`; the five paths are one shared record, not repository-specific variants. Any proposed modification must consider its effect on all five repositories and update every copy coherently. Temporary drift is permitted only during a choreographed rollout that identifies the outstanding copies explicitly.

Cross-repository work is choreographed rather than centrally orchestrated. Each repository owns its priorities, plans, workspace, verification, and commits. A repository may place a concrete handoff in another repository's Stream or roadmap, naming its origin and whether it blocks or is blocked by the local item. Work should remain non-blocking and independently executable unless a genuine prerequisite requires otherwise.

## Consequences

- Changes to philosophy and conceptual model begin in Arcadia Principal.
- Reusable agentic capabilities begin in the harness after the underlying pattern is established.
- A compatible harness publishes typed capabilities. Capability kinds retain their own content standards, while shared identity, inventory, installation, and activation contracts are settled across the harness, `tools-ki`, and Specifications.
- The CLI platform begins in `tools-ki`; the harness and `tools-ki` jointly supply implementation evidence to Specifications without either repository becoming the normative source.
- Specifications receive conceptual input from Arcadia and implementation evidence from the harness and `tools-ki`; applicable Active specifications then constrain conforming implementations.
- The website can publish all four source repositories while remaining independently deployable and non-authoritative.
- The Website owns the public tooling guide and the stable routes `https://knowledgeislands.info/harness/install` for user installation and `https://knowledgeislands.info/harness/bootstrap` for repository bootstrap; `tools-ki` owns the executable artifacts to which the user-install route resolves, while the harness owns the reusable capability artifacts it publishes.
- Every primary repository states its place in this ecosystem near the top of its README and carries the shared progress, commit, and choreography conventions in runtime-neutral guidance.
