---
id: KI-TOOL-KI-CLI-154
area: CLI
title: Territory tolerates unregistered members
kind: deliver
purpose: corrective
project: observatory
component: territory
priority: medium
size: m
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T07:40:43Z
updated_at: 2026-10-19T23:56:56Z
---

# KI-TOOL-KI-CLI-154: Territory Tolerates Unregistered Members

## Goal

`ki territory audit` and `ki territory show` check the registered members of a territory and name each unregistered declared member, instead of failing the whole territory before reporting anything, while still exiting non-zero until coverage is complete.

## Context

On 19 October 2026 the Knowledge Islands Observatory could not observe the `knowledge-islands` territory. ki-principal had added `https://github.com/knowledgeislands/ki-design` to the territory roster, but the checkout had not been registered on this machine, so `ki territory roots` and `ki territory audit` both exited 2 with "territory knowledge-islands member … is not registered". One new member that has not yet been registered took the whole territory out of view.

Kris Brown answered TERRITORY-REGISTER on 19 October 2026 with "All as recommended with the additional thinking", in the [Observatory decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.observatory/decisions.md) (ROADMAP-TERRITORY, AS-RECOMMENDED-PLUS). Option a) registered `ki-design`, and the territory audit now passes. Option c) hands this record to tools-ki. tools-ki owns its priority and design. The `obs-register` run captured it and did not implement it.

On 20 October the ki.baseline-rollout wave-1 audit met the same failure in Techmedix: `ki territory audit -t techmedix` and `ki territory show` exit 2 because the Capital declares `techmedix/apps-childhealthyorkshire.co.uk`, archived with no local clone ([evidence](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.baseline-rollout/report-wave1-audit.md), TERRITORY-TECHMEDIX). The coordinator folded that ask into this record at 00:14 BST under HIGH-APPLY.

## Boundary

- In: territory selection in `src/core/territory/resolution.ts`, the territories specification, `man/ki.1`, and the tests for them.
- Out: automatic registration, and any change to the registry or to how territory rosters are declared.

## Current state

Read at `62a37949` on 19 October 2026.

- `resolveTerritory` in `src/core/territory/resolution.ts` throws `KiError(…, 2)` for the first member with no registry entry, before filtering. The comment there says registration completeness is authoritative.
- [Territories specification](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/specs/territories.md) line 29 requires this: "Missing registration MUST fail even when a filter would exclude the member". `man/ki.1` describes the same failure. Changing the behaviour therefore changes an accepted requirement, not just the code.

## Design

Decided under HIGH-APPLY, 20 October, as the coordinator's TERRITORY-TECHMEDIX direction sets it:

- **Which commands tolerate it:** only `ki territory audit` and `ki territory show`. `roots`, `open`, `inspect`'s selection, and every `--territory` repository selection (`ki repo`, trades, agents) keep the strict, atomic TERRITORY-003 behaviour, because they act on every member.
- **Report and exit:** `resolveTerritory` takes an opt-in `unregistered: 'report'` and returns the unregistered identities on the profile instead of throwing. `show` lists the available members, then an `unregistered` branch naming each identity, with `summary: REPOSITORIES=<n> UNREGISTERED=<m>`. `audit` reports `<id>: incomplete`, one finding per unregistered member, and `FINDINGS=<m>`. Both exit 1 while any declared member is unregistered; the rest is still checked, and any other selection failure still exits 2.
- **Filters:** an unregistered identity is reported when its last path segment matches the filter, as a registered member's directory name does; a selection with neither matches still fails as matching nothing.
- **`--null` roots:** unchanged, still atomic.
- **Specification:** TERRITORY-003 keeps the strict rule for roots and operational commands and gains the reporting rule for `show` and `audit`.

## Steps

- [ ] Add the opt-in reporting mode to `resolveTerritory` and the profile.
- [ ] Render the unregistered members and exit 1 in `show` and `audit`.
- [ ] Add tests through `run(args, context)` in `src/tests/cli/territory/selection.test.ts`.
- [ ] Update TERRITORY-003, `man/ki.1`, the regenerated command inventory and the changelog.
- [ ] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/territory/resolution.ts`, `src/core/territory/types.ts`, `src/commands/territory/index.ts`
- `src/tests/cli/territory/selection.test.ts`
- `docs/specs/territories.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and `ki repo audit` pass.
- The source-built `ki territory audit -t techmedix` names the archived member, checks the other three and exits 1.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None.

### Specifications

TERRITORY-003 in the territories specification.

### Guides

None beyond the manual.

### Roadmap

None.

## Discussion

The four open design questions are settled in Design.
