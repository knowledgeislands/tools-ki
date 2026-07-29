---
id: KI-TOOL-CLI-011
title: Reconcile managed user skills in local development mode
theme: cli
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: 'knowledgeislands/ki-agentic-harness@92d5b263'
---

## Context

`ki dev on /Users/krisbrown/workspaces/kis/knowledgeislands/ki-agentic-harness` correctly records the local checkout in `~/.config/ki/config.toml`, and `ki diag` reports that local source.

However, the managed runtime links remain pointed at an older temporary harness payload:

```text
~/.agents/skills/ki-recap
~/.claude/skills/ki-recap
  -> /private/tmp/ki-fnd001-tools.anDDmK/data/ki/harnesses/knowledgeislands/ki-agentic-harness/...
```

The user configuration also still records only the former five core process skills, rather than the current eight.

As a result, a runtime may load old skill content even though `ki diag` claims local development mode is active.

Local development mode must make the managed user skills and their configuration agree with its reported local harness source.

## Boundary

This item concerns KI-managed user-skill reconciliation for `ki dev on` and its idempotent re-run.

It does not change harness acquisition, release installation, repository-declared governance, foreign user skills, or the semantics of the process skills themselves.

It must not add a compatibility fallback between local and installed payloads: one active local source must be reflected by the managed runtime links.

## Discussion

### Evidence

The mismatch was observed after the harness added `ki-implement`, `ki-accept`, and `ki-batch`, and updated `ki-recap`'s compaction boundary.

The canonical source was at `knowledgeislands/ki-agentic-harness@92d5b263`; `ki diag` showed that checkout as `Local source`, while both runtime links resolved to the older temporary payload and therefore exposed stale `ki-recap` content.

### Intended contract

`ki dev on <path>` should validate the local harness and reconcile every KI-managed core user skill from that local source into each configured detected runtime.

It should update the recorded managed-skill inventory from the current source, be safe to repeat, preserve foreign entries, and report the source actually linked.

### Verification shape

Use the existing black-box CLI sandbox contract.

Start from a managed old payload, enable local mode against a fixture harness containing the current core skill set, then assert that `ki diag`, `config.toml`, and every managed runtime link agree on the local source.

Repeat the command and assert idempotence.
