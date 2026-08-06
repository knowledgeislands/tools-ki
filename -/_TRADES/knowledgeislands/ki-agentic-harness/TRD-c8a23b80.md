---
id: TRD-c8a23b80
title: "Define stable Knowledge Base stream codes"
created_at: 2026-08-06T07:28:32Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: "KI-TOOL-CLI-017"
---
# TRD-c8a23b80: Define stable Knowledge Base stream codes

## Context

The ki repo roadmap listing now needs a concise stable identity for each Knowledge Base stream proposal. Folder names and proposal titles are human-readable and can repeat across the rendered Focus tree, while a code gives a short unambiguous display and reference surface.

## Submission

Extend ki-kb-streams to define a stream-proposal frontmatter code field: its requiredness, grammar, uniqueness scope, lifecycle stability, creation guidance, audit criteria, and migration path for existing proposals. The tools-ki reader already renders code when present and deliberately renders undefined when it is absent, making incomplete adoption visible without inventing an identifier from a mutable title.

## Constraints

The Harness retains authority over field name, grammar, scope, compatibility, and rollout. Do not derive codes from titles or paths. Keep the field suitable for concise CLI display and durable cross-reference, and preserve explicit diagnostics for malformed proposal records.
