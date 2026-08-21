---
id: TRD-ace87343
title: "Honor declared Agora projection order"
created_at: 2026-08-21T01:42:28Z
sender: knowledgeislands/ki-agentic-harness
receiver: knowledgeislands/tools-ki
kind: work
source_ref: "ki-agora CONFIG-1"
observation: decision
phase: received
decision_status: adopted
received_from_ref: 27285e8facca76fc0230085b2569a4eac46a48e6
reviewed_at: 2026-08-21T16:55:02Z
rationale: "The change affects a public configuration contract and several CLI consumers, so it requires separately planned and reviewed local work."
adopted_as: KI-TOOL-CLI-051
---

# TRD-ace87343: Honor declared Agora projection order

## Context

The ki-agora home contract now permits an optional order array containing a duplicate-free ordered prefix of canonical identities drawn from the owner and declared members. The ki-all home uses it to place chezmoi first, then ki-agentic-harness, tools-ki, tools-mgit, and homebrew-tap before the remaining lexical members.

## Submission

Update the tools-ki Agora parser and resolver so declared homes accept and validate order, resolved profiles emit that ordered prefix, and unlisted participants retain lexical local-key order. Apply the result consistently to show, roots, open, and repository selection, with focused resolver and CLI tests.

## Constraints

Keep the estate Agora lexical and system-managed. The declaration must remain portable: order entries are canonical HTTPS repository identities, may include the owner, must be unique and already participate in the home, and change ordering only—not membership, role, priority, routing, or authority. Preserve current behavior when order is absent.
