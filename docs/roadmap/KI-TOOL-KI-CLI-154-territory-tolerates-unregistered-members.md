---
id: KI-TOOL-KI-CLI-154
area: CLI
title: Territory tolerates unregistered members
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T07:40:43Z
updated_at: 2026-10-19T07:40:43Z
---

# KI-TOOL-KI-CLI-154: Territory Tolerates Unregistered Members

## Goal

`ki territory` selects the registered members of a territory and warns about each unregistered one, naming it, instead of failing the whole territory.

## Context

On 19 October 2026 the Knowledge Islands Observatory could not observe the `knowledge-islands` territory. ki-principal had added `https://github.com/knowledgeislands/ki-design` to the territory roster, but the checkout had not been registered on this machine, so `ki territory roots` and `ki territory audit` both exited 2 with "territory knowledge-islands member … is not registered". One new member that has not yet been registered took the whole territory out of view.

Kris Brown answered TERRITORY-REGISTER on 19 October 2026 with "All as recommended with the additional thinking", in the [Observatory decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.observatory/decisions.md) (ROADMAP-TERRITORY, AS-RECOMMENDED-PLUS). Option a) registered `ki-design`, and the territory audit now passes. Option c) hands this record to tools-ki. tools-ki owns its priority and design. The `obs-register` run captured it and did not implement it.

## Boundary

- In: territory selection in `src/core/territory/resolution.ts`, the territories specification, `man/ki.1`, and the tests for them.
- Out: automatic registration, and any change to the registry or to how territory rosters are declared.

## Current state

Read at `62a37949` on 19 October 2026.

- `resolveTerritory` in `src/core/territory/resolution.ts` throws `KiError(…, 2)` for the first member with no registry entry, before filtering. The comment there says registration completeness is authoritative.
- [Territories specification](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/specs/territories.md) line 29 requires this: "Missing registration MUST fail even when a filter would exclude the member". `man/ki.1` describes the same failure. Changing the behaviour therefore changes an accepted requirement, not just the code.

## Open design questions

- Which commands tolerate it: `roots`, `audit`, `inspect`, and the trade and agent selections that use `resolveTerritory`. Should some keep failing, for example where every member must be acted on?
- Where the warning goes and how it looks: stderr, the existing `TerritoryWarning` callback, an audit finding, and whether the exit code changes.
- Whether `--null` roots output stays atomic when it leaves members out.
- How the specification's requirement on missing registration and its verification in `src/tests/cli/territory/selection.test.ts` change.

## Discussion

None.
