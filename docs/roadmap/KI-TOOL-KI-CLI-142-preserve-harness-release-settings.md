---
id: KI-TOOL-KI-CLI-142
area: CLI
title: Preserve harness release settings
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T19:29:34Z
updated_at: 2026-10-16T19:29:34Z
---

# Preserve harness release settings

## Goal

KI retains configured harness release locations, verification digests and authentication settings when another configuration operation rewrites the user configuration. Changing bootstrap, skills or a local development selection must not silently remove the information needed to install a selected harness.

## Context

The current source proves a mismatch between reader and writer ownership. [The harness registry reader](../../src/core/storage/registry.ts) accepts `harnesses.releases` entries with `id`, `url`, `sha256` and optional `auth`. In [the user configuration writer](../../src/agents/configuration.ts), `preservedTables` excludes the entire `harnesses` table because it is in `OWNED_KEYS`, while `renderConfiguration` emits only `harnesses.ids`. The writer has no release-entry input, so rewriting a configuration drops its configured release entries rather than round-tripping them.

This writer is called by [bootstrap and user-configuration refresh](../../src/agents/bootstrap.ts), and by local-source and configured-skill setters in the same configuration module. A reviewed chezmoi source retaining a release pin can consequently drift from the live configuration after an otherwise unrelated KI operation. Preserve the configured values instead of treating the missing live block as a reason to discard its source declaration.

## Boundary

Capture only; no implementation, adoption, priority, release, provider call or live configuration rewrite is authorised. Do not change release selection, digest validation, authentication policy or the built-in canonical harness contract. Authentication settings mean strategy/configuration metadata, never credentials to copy into repository records or tests. Moving host-specific local harness paths has a separate outcome and must not be bundled into this repair.

## Discussion

### Round-trip ownership

Decide how the writer carries complete supported harness release entries alongside harness identities. Retain meaning across rewrites, including all selected releases and each supported authentication shape, rather than preserving only the release seen in one machine's configuration. Preserve unrelated delegated tables and current validation failures; accepting unknown or malformed release data is not an incidental requirement of this fix.

### Evidence and verification expectations

The future repair needs public CLI contract coverage through `run(args, context)` for the supported rewrite paths, using synthetic releases and injected capabilities without network access or secrets. Verify that parsed release identity, URL, digest and authentication settings survive, while the requested bootstrap, skill or local-setting change still takes effect.

After an approved implementation, verify Terra and Sol separately against their own reviewed source and live configurations, recording the installed CLI version and the operations actually exercised. Any managed configuration apply or rewrite needs its normal approval boundary. Current code evidence establishes the defect; Sol has not been inspected for this concern, and a result on Terra must not be reported as proof for Sol.
