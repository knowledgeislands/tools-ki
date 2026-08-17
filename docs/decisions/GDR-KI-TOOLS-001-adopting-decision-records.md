---
id: GDR-KI-TOOLS-001
title: 'Adopting Decision Records'
date: 2026-07-24
status: current
decision_type_url: https://knowledgeislands.info/specifications/decision-records/gdr
decision_type: governance
---

# GDR-KI-TOOLS-001: Adopting Decision Records

## Context

`tools-ki` owns the public `ki` executable platform and its release artifacts. Significant decisions about that platform need a compact, current record that is readable independently of implementation history.

## Decision

`tools-ki` adopts Decision Records under `docs/decisions/`. The collection follows the shared Knowledge Islands Decision Records standard, begins with this governance record, and indexes records in curated reveal order.

## Consequences

- Significant CLI-platform decisions have a durable current-state home.
- The shared ecosystem record is mirrored in this collection alongside the other five primary repositories.
- Routine implementation and roadmap work remain outside the Decision Records collection.
