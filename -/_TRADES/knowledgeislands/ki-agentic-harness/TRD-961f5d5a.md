---
id: TRD-961f5d5a
title: "Encode trade lifecycle in the record rather than its directory"
created_at: 2026-08-07T06:34:52Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: "-/_TRADES/_PREPARATIONS"
observation: decision
---
# TRD-961f5d5a: Encode trade lifecycle in the record rather than its directory

## Context

A trade record's lifecycle is encoded twice, once in its path and once in its frontmatter, and the two carry different amounts of it. A local preparation lives beneath `-/_TRADES/_PREPARATIONS/<owner>/<name>/` and declares `phase: preparing`, which the reader validates. A submitted sender copy lives beneath `-/_TRADES/<owner>/<name>/` and declares no phase at all, because submission removes the field; the submitted state is therefore expressed by the absence of a marker rather than by a value, and a record that lost its phase line to any other cause is indistinguishable from a submitted one. The reserved directory name also shares a namespace with repository owners, so the outbound scan has to skip an entry literally named `_PREPARATIONS` while walking owner directories. Submission strips the field by replacing the exact text of a phase line followed by the closing frontmatter delimiter, which silently depends on `phase` remaining the last key in the block; reordering the frontmatter would leave a submitted record still declaring itself as preparing, with nothing to catch it.

## Submission

Consider letting an explicit `phase` field carry the lifecycle on its own, drawn from a closed vocabulary that names every state a copy can hold rather than only the first one. A preparation would then differ from a submission by the value of a field rather than by its location, submission would rewrite that field instead of moving a file, and the outbound scan would need no reserved directory name to skip. Per-partner grouping under `<owner>/<name>` earns its place and this proposal keeps it; only the `_PREPARATIONS` level would go, because it encodes state where every other path segment encodes counterpart. The receiver's `decision_status` should remain a separate field rather than being folded into the same vocabulary, since it records the receiver's disposition toward a trade rather than the state of the copy that carries it, and the two advance independently. Making the phase explicit everywhere would also replace a text substitution that depends on frontmatter key order with an ordinary field update.

Today the same trade occupies two different paths either side of submission, and carries the field in only one of them:

```text
-/_TRADES/_PREPARATIONS/knowledgeislands/ki-agentic-harness/TRD-aacc8a12.md
    observation: decision
    phase: preparing

-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-094f7987.md
    observation: decision
```

Under the proposal the path is stable across the transition and the field carries the change:

```text
-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-aacc8a12.md
    observation: decision
    phase: preparing

-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-094f7987.md
    observation: decision
    phase: submitted
```

A received copy in the counterpart repository would read `phase: received` beside the `decision_status` and `received_from_ref` that receipt already adds, so the copy's own state and the receiver's disposition stay legible as separate axes.

## Constraints

The Harness owns the record contract, the phase vocabulary, and whether the directory layout changes at all. Two consequences belong in that assessment. Replacing a file move with a field rewrite changes what version control shows for a submission, from a rename to a content change, which may or may not be the history the estate wants. Separately, this proposal does not touch the `-` and `+` working areas, which continue to encode direction even though the sender and receiver fields already determine it; whether that redundancy is worth removing is a distinct question from the one raised here, and the working areas carry meaning beyond trades. No migration path is proposed, because existing records are few and the receiver is better placed to judge whether to rewrite them or let the vocabulary apply only to new ones.
