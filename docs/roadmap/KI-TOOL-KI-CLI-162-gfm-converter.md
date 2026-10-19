---
id: KI-TOOL-KI-CLI-162
area: CLI
title: GFM link converter
project: tools-burndown
priority: high
size: m
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T21:22:30Z
updated_at: 2026-10-19T21:22:30Z
transferred_from: ki-principal ki.tools-burndown GFM-CONVERTER, routed from ki.ways-of-working GFM-ORDER a and GFM-LINK-FORM a, 2026-10-19
---

# KI-TOOL-KI-CLI-162: GFM Link Converter

## Goal

An island owner can convert the Obsidian wikilinks and unsized image embeds in an explicit set of Markdown files into GitHub-flavoured Markdown links, previewing every change first and applying exactly the reviewed preview, with anything that needs judgement left untouched and listed.

## Context

Kris approved at 22:00 BST on 19 October, under GFM-ORDER a and GFM-LINK-FORM a, that Knowledge Islands prefers GitHub-flavoured Markdown and that tools-ki builds the converter the conversion needs. The decision is GFM-CONVERTER in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md); the requirements are the Converter requirements in the ki.ways-of-working [GFM migration design note](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/design/gfm-migration.md).

The converter blocks the ki-principal conversion, which ki-principal carries through its Enactment Process in staged batches: each batch is previewed, its exceptions decided, then applied and committed alone, with a separate formatter commit after it. Other islands convert later with the same released converter.

The requirements, in short:

1. A resolver in Obsidian's order - beside the note, then full path, then a unique leaf name, case-insensitive - emitting the exact on-disk case, with a declared, testable candidate universe and precedence.
2. Document-relative destinations, in angle brackets when the path holds a space; GFM image syntax for embeds; heading fragments as decided per batch; Obsidian's `%20` spelling normalised structurally, keeping needed URI escapes.
3. Only plain and aliased wikilinks (including `\|` in table cells) and unsized image embeds convert; every other construct is left untouched and listed.
4. `--dry-run` gives a per-file diff and a report of ambiguous, unresolved and judgement items: the Enactment preview.
5. Explicit paths only; never the whole repository by default.
6. A fail-closed preflight refusing undecided judgement items, protected or generated material, and destinations that changed since the preview.
7. An unchanged-bytes guard that aborts the whole batch unless every input matches the reviewed preview.
8. Per-link verification of target identity, fragment, label and image asset, in exact case.
9. Byte-identical preservation outside the converted link spans.
10. Idempotence and containment.
11. A rollback manifest of changed paths and their pre-images.
12. No formatter mixed in.
13. Fixture tests on the ki-principal shapes.

## Boundary

- In: the converter command, its preview, decisions and manifest files, the resolver, help, manual, command inventory, changelog, README and a user guide, and fixture tests through `run(args, context)`.
- Out: converting any island, which each island owns (ki-principal under its own conversion record); the harness linking-standard and link-audit changes, which ki-agentic-harness owns; the Obsidian configuration change; formatting with rumdl, which runs as a separate commit; machine-local absolute `/Users/` links; a release, which is ask-first.

## Discussion

### Host

Two hosts were offered: a `ki repo conform --skill ki-authoring` operation or a command of its own. The converter is its own command, `ki markdown gfm`, because:

- `ki repo conform` runs a skill's whole-repository catalogue, and the ki-authoring catalogue lives in ki-agentic-harness, which tools-ki does not own;
- conform has no explicit path scope, no per-file diff preview, no reviewed-preview guard and no rollback manifest, which requirements 4 to 7 and 11 need;
- ki-authoring's conform also runs rumdl, which requirement 12 keeps out of the conversion commit.

A `markdown` command group leaves room for later Markdown operations, such as a link audit, without overloading `repo`.
