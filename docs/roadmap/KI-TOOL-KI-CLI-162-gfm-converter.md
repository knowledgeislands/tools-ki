---
id: KI-TOOL-KI-CLI-162
area: CLI
title: GFM link converter
kind: deliver
purpose: capability
project: tools-burndown
component: markdown
priority: high
size: m
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T21:22:30Z
updated_at: 2026-10-19T21:30:00Z
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

## Current state

tools-ki has no Markdown conversion. `ki repo conform` runs harness catalogues over whole repositories. ki-principal holds about 1,070 wikilinks in 201 of 364 tracked Markdown files, 21 escaped table aliases, 10 heading links, 16 embeds (5 sized to width 800), two custom `[!todo]` callouts, one Dataview note and 20 Obsidian templates with placeholder destinations.

## Design

### Command

`ki markdown gfm <path...> [--root <dir>] [--decisions <file>] [--dry-run] [--preview <file>] [--manifest <file>]`

- A path is a Markdown file or a directory whose Markdown files are taken, skipping dot-entries and `node_modules`; at least one is required, and each must sit inside the root.
- The root is `--root` or the nearest enclosing directory holding `.obsidian` or `.git`.
- `--dry-run` prints a zero-context unified diff per changed file, then the report; with `--preview <file>` it also writes the preview.
- Without `--dry-run` the command applies, and requires both `--preview <file>` from a dry run and a new `--manifest <file>`.

### Resolver

The candidate universe is every regular file under the root, skipping dot-entries (`.git`, `.obsidian`, `.trash`) and `node_modules`; symbolic links are not followed. A target without a Markdown or file extension is tried with `.md` and as written. Precedence: beside the note, then full path from the root, then a path suffix or unique leaf name. Each step takes an exact-case match first, then a unique case-insensitive match; several matches in the deciding step make the link ambiguous, none in every step unresolved. The emitted destination is the on-disk spelling.

### Conversion

- `[[T]]`, `[[T|A]]` and `[[T\|A]]` become `[label](<dest>)`: the label is the alias, or the target as written; `[`, `]`, `\` and other link-text metacharacters are escaped.
- `![[img.ext]]` and `![[img.ext|alt]]` for an image extension become `![alt](<dest>)`, the alt text being the alias or the file name.
- Destinations are document-relative POSIX paths, in angle brackets when they hold a space or parenthesis; `%`, `#` and `?` in file names are percent-encoded.
- A relative Markdown link whose path uses `%20` is respelt with a literal space in angle brackets when the decoded path resolves; other escapes and the fragment are kept.
- Heading links convert only when the decisions file sets `heading_fragments = "github"`, using the target heading's GitHub slug; otherwise they are listed.
- Front matter, fenced and inline code, Obsidian `%%` and HTML comments and `{{ }}` and `<% %>` template expressions are never rewritten.

### Items and decisions

Listed kinds: `ambiguous`, `unresolved`, `heading-link`, `missing-heading`, `block-reference`, `sized-embed`, `transclusion`, `front-matter-link`, `template-destination`, `comment-link`, `callout`, `dataview`, `protected` and `generated`. Protected material is any path inside a `_Voice Notes` directory or a `protected` path the decisions file names; generated material is a file opening with `<!-- GENERATED`. A TOML decisions file approves each item by `path` and exact `text`, with `action = "keep"` for an approved exception or `action = "convert"` with a `target` for an ambiguous or unresolved link. An undecided item is reported in a dry run and refuses the batch at apply.

### Preview, guard and manifest

The preview is JSON naming the root, the decisions file hash and, per file, its input and output SHA-256 and conversions. Apply rebuilds the plan, then aborts the whole batch before any write unless the path set, decisions hash and every input and output hash match and no item is undecided. It writes the manifest (paths, pre-images and hashes) before the first file. Each conversion is re-parsed and its target, fragment, label and image flag compared with the source link, and the text outside converted spans is compared byte for byte; either mismatch aborts the batch.

## Steps

- [ ] Add the `markdown` component and command group with `gfm`, its option validation and rendering.
- [ ] Build the core: vault index and resolver, scanner of protected regions and constructs, converter, verification, decisions, preview and manifest.
- [ ] Write fixture tests through `run(args, context)` on ki-principal shapes: table aliases, headings, embeds with and without size, spaces, case mismatches, templates, code examples, reference definitions, callouts, Dataview, front matter, protected and generated files, guard failures, idempotence and containment.
- [ ] Update the manual, command inventory, inventory test, changelog, README and a user guide.
- [ ] Dry-run against ki-principal by batch, writing previews only to temporary storage.
- [ ] Run the gate and move the record to Awaiting review.

## Files touched

- `.ki.toml`
- `src/commands/markdown/index.ts`, `src/commands/root/catalogue.ts`, `src/commands/root/index.ts`
- `src/core/markdown/`
- `src/tests/cli/markdown/`, `src/tests/cli/manage/inventory.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, `README.md`, `docs/guides/user/markdown-conversion.md`, `docs/guides/user/README.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bun scripts/generate-command-inventory.ts` and `ki repo audit` pass.
- `ki markdown gfm <ki-principal paths> --dry-run` runs read-only and its summary is reported.

## Dependencies / blocks

None to build. It blocks the ki-principal GFM conversion, which ki-principal carries as its own work and cannot start until this converter is released. The harness linking-standard change in ki-agentic-harness is independent.

## Documentation impact

### Decision Records

None: the host choice is recorded under Discussion and is local to this command; the GFM preference itself is ki-principal's decision.

### Specifications

None: no portable contract changes; the manual and command inventory carry the command grammar.

### Guides

A new user guide, `docs/guides/user/markdown-conversion.md`, explains the preview, decide and apply cycle and the decisions file.

### Roadmap

None in tools-ki. ki.tools-burndown tells ki.ways-of-working when a release carries it.

## Discussion

### Authority

Kris's GFM-CONVERTER approval routed the build with these requirements; this run plans and implements under it, with local commits only and no release.

### Host

Two hosts were offered: a `ki repo conform --skill ki-authoring` operation or a command of its own. The converter is its own command, `ki markdown gfm`, because:

- `ki repo conform` runs a skill's whole-repository catalogue, and the ki-authoring catalogue lives in ki-agentic-harness, which tools-ki does not own;
- conform has no explicit path scope, no per-file diff preview, no reviewed-preview guard and no rollback manifest, which requirements 4 to 7 and 11 need;
- ki-authoring's conform also runs rumdl, which requirement 12 keeps out of the conversion commit.

A `markdown` command group leaves room for later Markdown operations, such as a link audit, without overloading `repo`.
