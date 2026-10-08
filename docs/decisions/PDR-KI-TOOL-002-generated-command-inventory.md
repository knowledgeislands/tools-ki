---
id: PDR-KI-TOOLS-002
title: 'Generated command inventory'
date: 2026-09-25
status: current
decision_type: product
decision_type_url: https://knowledgeislands.info/specifications/decision-records/pdr
---

# PDR-KI-TOOLS-002: Generated command inventory

## Context

The public `ki` surface is described by the Commander command tree, shell-completion grammar, manual synopsis, detailed manual command groups, and changelog inventory. Those surfaces serve different readers, but integrations also need a stable machine-readable list of commands and descriptions without executing a locally installed binary or scraping terminal formatting. Maintaining another handwritten inventory would create a new source of drift, while projecting only the Commander tree would lose the reconciled purpose-oriented descriptions carried by the manual.

## Decision

The repository publishes `man/ki.commands.json` as the versioned `ki/commands/v1` integration contract. It is generated from the reconciled manual command groups, which carry the complete command invocations and full descriptions. Generation fails closed unless the manual synopsis and detailed command groups agree semantically. Contract tests also compare the generated command paths with the independently registered command tree exposed through completion generation.

The tracked manual remains the human terminal reference. The generated JSON is a repository and pinned-reference integration surface, not an independently authored command authority. Any public grammar change must update the executable surface, manual, generated inventory, and changelog together.

## Consequences

- Integrations can consume a schema-identified, deterministic command inventory from an exact repository revision.
- Purpose-oriented descriptions remain authored once in the manual and are preserved in machine-readable output.
- Drift between implementation, synopsis, detailed manual, and generated output becomes a failing verification condition.
- The generated file adds review noise when public commands change, but makes the externally visible contract explicit.
