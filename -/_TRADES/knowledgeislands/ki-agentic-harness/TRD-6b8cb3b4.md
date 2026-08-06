---
id: TRD-6b8cb3b4
title: "Define observable CLI boundary testing"
created_at: 2026-08-06T07:10:45Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: "KI-TOOL-CLI-017"
observation: decision
---
# TRD-6b8cb3b4: Define observable CLI boundary testing

## Context

While restoring tools-ki to its required 100% coverage gate, the uncovered spans were evaluated at the public CLI boundary. Each reachable span mapped to a valid end-to-end CLI case; spans with no legitimate CLI input were removed as dead code rather than preserved through internal-only tests or mocks.

## Submission

Add shared engineering guidance that architecturally significant boundaries should be expressed as observable public contracts. Treat a coverage gap as a decision: add a valid end-to-end case at that contract boundary, or remove the unreachable code. Keep internal implementation details out of the test seam unless an explicitly justified interface-level fault injection is required.

## Constraints

The Harness retains authority to judge scope, placement, and wording. Preserve the distinction between valid CLI behaviour and artificial coverage: do not require tests for paths with no supported external input, and do not make this principle specific to tools-ki.
