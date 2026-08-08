---
id: KI-TOOL-CLI-033
title: Match skill header keys
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: 3adc5713e33ee22d3cdc203edf7409c91379430d
---

## Goal

Make `ki repo skill remove` recognise a skill declaration however TOML spells its table header, so the command cannot report success while leaving the declaration it was asked to remove.

## Context

`readDeclaredSkills` finds declarations by parsing `.ki-config.toml` with `smol-toml`. `undeclareRepositorySkill` removes them by matching header text exactly, in `isDeclaredHeader`:

```ts
return header === `["${identity}"]` || header.startsWith(`["${identity}".`)
```

That accepts one spelling. TOML — the specification, not a permissive extension of it — also permits a literal-string key and whitespace inside the brackets, so `['owner/harness:ki-repo']` and `[ "owner/harness:ki-repo" ]` denote the same table as `["owner/harness:ki-repo"]`. The parser therefore reports the declaration, the text matcher does not find it, `removed` stays `false`, and the function returns without writing.

The consequence is not a failed command but a successful-looking one. `removeRepoSkill` in `src/agents/skills.ts` returns `removed: removed || undeclared`, so a run that deleted every projection and undeclared nothing reports removal. The skill's symlinks are gone, the declaration remains, and the next audit resolves a declared skill whose projections no longer exist.

This is the same failure class as `KI-TOOL-CLI-030`: an operation that acted on part of what it was asked to do, reporting the exit code of one that acted on all of it. The pragma at `src/core/configuration.ts:135` justified the unreachable-looking `!removed` return by saying removal only follows locating the declaration in the same parsed file. It does — but the locating is done by a TOML parser and the removal by string comparison, and the two do not agree on what the same file says.

## Boundary

This item owns how a declared skill's table header is recognised when editing `.ki-config.toml` as text. It does not change the declaration schema, the identity vocabulary, or what `ki repo skill add` writes, which remains the canonical basic-string spelling. It does not introduce a TOML serialiser: the edit stays textual so unrelated content, comments and ordering survive, which is why the header must be parsed rather than matched. `KI-TOOL-CLI-025` may restructure these keys entirely; this fix is correct for the current contract and does not depend on that outcome.

## Current state

`isDeclaredHeader` compares against one literal spelling. `undeclareRepositorySkill` returns `false` when nothing matched, and that return is exempted by a pragma whose justification does not survive the parser/matcher split. `removeRepoSkill` folds that `false` into an `||` with projection removal, so it cannot surface.

## Steps

- [x] Extract the first key of a TOML table header and compare it to the identity, accepting a basic string, a literal string, and surrounding whitespace, rather than matching one rendering of the line.
- [x] Remove the pragma at `src/core/configuration.ts:135` and cover the branch, which is reachable whenever a header is spelled any other legal way.
- [x] Report a removal that undeclared nothing as the partial result it is, rather than folding it into a boolean disjunction with projection removal.
- [x] Cover through the CLI: a literal-string header and a whitespace-padded header both removed, and the reporting for a declaration that genuinely cannot be removed.

## Files touched

- `src/core/configuration.ts` — header key extraction and the removal return.
- `src/agents/skills.ts` — how a partial removal is reported.
- `src/tests/cli/repo/` or `src/tests/cli/skill/` — the alternate spellings and the partial-removal report.

## Verify

`bun run test:coverage` passes with 100% on all four metrics and one fewer exempted line. A test declares a skill with a literal-string header, removes it, and asserts the declaration is gone from `.ki-config.toml` — not merely that the command exited zero, which it already does today while doing nothing.

## Dependencies / blocks

Nothing blocks this item. It shares its cause with `KI-TOOL-CLI-031` and `KI-TOOL-CLI-032` — a justification resting on an upstream guarantee that one caller does not provide — and its failure shape with `KI-TOOL-CLI-030`.

## Review

The header key is now read by `smol-toml` itself rather than extracted by hand. An earlier attempt did parse the key manually and got TOML's escape semantics wrong — `-` decoded to `u002D` — which would have reintroduced the same class of disagreement it was fixing. Handing the line to the grammar's own parser makes the two readings agree by construction.

Coverage required one case beyond the item's steps. `headerKey` returns undefined when a line looks like a header but does not parse, and that is reachable inside a multi-line string: a `[not a header]` line within a `"""` block starts with `[`, ends with `]`, and is not valid TOML alone while the document around it is valid. The test fixture now carries such a decoy, so the reader is proved to decline it rather than fail the removal.

One correction to the record's Context: the reachable spellings are the literal string and the whitespace-padded form, but an inline table is not among them, because a top-level inline table has no header for the editor to find at all. That is the case the new refusal test uses, and it needs the inline table to precede every other header — placed after one, it belongs to that table rather than to the document, and is not a declaration.

`bun run test:coverage`: 100% on statements, branches, functions and lines across 4921 statements, with one fewer exempted line.

## Discussion

### Why not serialise the document

Rewriting `.ki-config.toml` through a TOML serialiser would make the whole class of spelling mismatch impossible, and would discard comments, key order, and formatting that a hand-maintained configuration is entitled to keep. The file is authored by people and read in review. Editing it as text is the right call; the defect is that the text edit trusted one spelling of a syntax with several.

### Why this was invisible

Every declaration this repository writes uses the canonical spelling, so the matcher agrees with the parser on every file the tool produced. The disagreement needs a hand-edited or externally-generated configuration, which is exactly the input the pragma's justification assumed away.
