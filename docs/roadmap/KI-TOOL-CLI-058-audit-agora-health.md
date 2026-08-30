---
id: KI-TOOL-CLI-058
area: CLI
title: Audit Agora health
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

# Audit Agora health

## Goal

Provide an explicit read-only Agora health command that gives people and automation a reliable pass/fail result with actionable diagnostics across the locally resolved Agora estate.

## Context

`ki agora list` exposes broken profiles as part of its inventory output, but it is not an explicit audit surface. An unregistered `mcp-acquire-whatsapp` checkout recently made both `ki-all` and `ki-mcps` unresolvable even though the repository already carried reciprocal membership declarations. A dedicated audit should make registration, declaration, reciprocity, duplicate-identifier, and member-order failures difficult to overlook.

## Boundary

The audit must not register repositories, repair declarations, infer membership, edit peer repositories, or inspect editor-specific workspace state. Target projection drift belongs to `KI-TOOL-CLI-059`.

## Shaping

Reuse the canonical Agora resolver and its existing diagnostics rather than introduce a second interpretation of membership. Define whether the command audits all profiles by default and optionally accepts one name, establish stable non-zero exit behaviour for any broken selected profile, and decide whether machine-readable output extends the existing roots interface or needs a separate explicit format. Promote when the public command shape and specification evidence are settled.

## Discussion

### Audit versus inventory

`list` should remain a human inventory that can show healthy and broken entries together. `audit` should be a verification gate whose exit status is safe to use in scheduled checks and repository-management workflows.

### Repair authority

Diagnostics should name the missing or conflicting registration and the repositories carrying each declaration. Any repair remains an explicit registry or repository-authorised operation.
