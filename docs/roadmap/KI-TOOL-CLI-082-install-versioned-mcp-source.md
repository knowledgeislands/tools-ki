---
id: KI-TOOL-CLI-082
area: CLI
title: Install versioned MCP source
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
transferred_from: ki-agentic-harness
created_at: 2026-09-24T07:59:48Z
updated_at: 2026-09-24T07:59:48Z
---

# KI-TOOL-CLI-082: Install versioned MCP source

## Goal

Install a Knowledge Islands MCP server by GitHub `owner/repository` and an optional deliberate version, with inspectable provenance, atomic activation, rollback, update, and uninstall.

## Context

The Harness source-distribution contract defines an installable release as an annotated `v<SemVer>` tag resolving to a full commit object ID, with the matching package version, governed build, committed Bun lockfile, and MCP entry point. It deliberately does not require npm publication, official MCP Registry metadata, or a duplicative repository descriptor.

This receiver item owns the product behaviour proposed as `ki manage mcp install`. It must resolve explicit versions exactly and may resolve an omitted version only through the repository owner's latest stable GitHub Release marker. Public and private repositories use the same contract; private access relies on the operator's existing Git credentials.

## Boundary

Do not publish server packages, create tags or releases, change repository visibility, establish Git credentials, edit live MCP bindings, or advertise the command on the website before it exists. The Harness owns repository readiness, `ki-binding` owns client configuration, and server owners retain release authority.

## Discussion

### Installation lifecycle

Resolve the selected tag and full commit before building. Stage outside a working checkout, install from the committed lockfile in frozen mode, run the governed build, verify the declared entry point, then atomically change the active version only after every step succeeds. A failed install or update must leave the prior active version usable.

### Provenance

Retain a versioned machine-readable receipt containing repository identity, tag, full commit, package version, entry point, installation time, schema version, and active state. Updates and rollbacks select complete installations rather than mutate an active directory in place.

### Product decisions still to shape

Planning must choose the XDG data layout, command and flag surface, stable-release lookup mechanism, Git checkout or archive strategy, receipt schema, garbage-collection rules, recovery behaviour, and how install state is exposed to binding workflows. Those choices belong here rather than in the Harness contract.
