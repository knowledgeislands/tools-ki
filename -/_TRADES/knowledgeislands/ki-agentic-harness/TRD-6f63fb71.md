---
id: TRD-6f63fb71
title: 'Assign documentation governance boundaries'
created_at: 2026-08-06T02:06:57Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: KI-TOOL-CLI-019
observation: receipt
---

# TRD-6f63fb71: Assign documentation governance boundaries

## Context

Re-engineering `tools-ki` Feature Definitions and moving its developer documentation into `docs/guides/` made the shared repository documentation topology concrete. The documentation concerns are stable across non-Knowledge-Base repositories: Decisions explain why, Feature Definitions describe what the system does, guides explain how to use or maintain it, and roadmap items record when future work happens. The current standards state parts of this split in multiple skills without assigning the physical `docs/` topology to the repository-shape owner or requiring roadmap work to assess its documentation impact.

## Submission

Make `ki-repo` the portable owner of the shared `docs/` topology and its four authority boundaries: `docs/decisions/` for why, `docs/features/` for what, `docs/guides/` for how, and `docs/roadmap/` for when. Keep each specialist skill responsible for its own directory's content and structure, and keep `ki-authoring` responsible for writing and knowledge-placement judgment within that topology. Extend `ki-roadmap` so immediate work items must explicitly assess the impact on every authority, naming an update or a justified not-applicable result. Make the section's presence mechanical; keep the truth of its assessment a judgment review.

## Constraints

This is a knowledge submission, not a receiver instruction. The Harness retains all decisions on standard wording, rubric design, and rollout. Do not require every item to update every documentation authority: require an explicit assessment, not unnecessary churn. Do not make `ki-guides` the owner of the whole taxonomy or duplicate specialist checkers in `ki-repo`. Preserve the four specialist skills' independent use and route any durable cross-skill contract through their canonical standards and rubrics.
