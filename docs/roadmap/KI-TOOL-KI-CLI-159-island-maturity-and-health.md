---
id: KI-TOOL-KI-CLI-159
area: CLI
title: Island maturity and health
kind: deliver
purpose: capability
project: observatory
component: territory
priority: medium
size: m
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T18:53:00Z
updated_at: 2026-10-20T07:16:16Z
transferred_from: ki-principal ki.observatory CONDITION-TOML, 2026-10-19
---

# KI-TOOL-KI-CLI-159: Island Maturity and Health

## Goal

`ki` exposes, for each island in a territory or estate, its declared maturity read from its `.ki.toml` and its audit-derived health, sound, in decline or in ruin, read from `ki repo audit`, in a versioned machine-readable form, so that the Observatory reads both through `ki` rather than parsing configuration or inventing either signal.

## Context

Kris Brown decided under CONDITION-TOML on 19 October 2026, logged in the [Observatory decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.observatory/decisions.md), that each island declares its maturity in `.ki.toml` from a fixed scale the `ki-repo` standard defines, and that decline or ruin comes from `ki repo audit` health. The Observatory reads both through `ki`.

The harness defined both in [KI-HARNESS-GOV-223](https://github.com/knowledgeislands/ki-agentic-harness/blob/d100fb4dddf505693730db1cc6f8fb6f8a5daa92/docs/roadmap/KI-HARNESS-GOV-223-island-maturity-declaration.md), accepted on 20 October 2026 in commits `c06c5d1f` and `5c38c0a8`. Its `ki-repo` standard, section Island maturity, sets:

- the key, `maturity` in `[skills.ki-repo]`, with one of four ordinal levels, lowest first: `founding`, `growing`, `settled`, `thriving`;
- the decline rule: an audit that cannot complete, or that has any failure, reads as ruin; otherwise any WARN reads as decline; otherwise neither applies. The source is the latest completed whole-repository `ki repo audit` of every applicable declared skill, with no skill or path filter, judged by its structured findings and execution outcome rather than its exit status. An older successful audit never hides a newer failed attempt. Decline never changes the declared level, and an undeclared island that otherwise passes reads as decline, because MATURITY-1 warns;
- four reader cases: a clean audit reads as neither, a warning-only audit as decline, a failure-plus-warning audit as ruin, and an audit that cannot complete as ruin.

## Boundary

- In: reading the declared maturity key and validating it against the scale; deriving health from the island's `ki repo audit` outcome under the mapping the `ki-repo` standard states; a versioned JSON shape carrying both, with the observed time of the health reading; human output; tests.
- In: reporting an undeclared maturity or an audit that cannot run as unknown, never as a level.
- Out: defining the scale, the key or the health mapping, which the harness's `ki-repo` standard owns; declaring a level in any repository; the Observatory views that draw the signals, which apps-observatory.local owns.

## Current state

Checked on 20 October 2026 at `39f1a91d`.

- `ki territory show` (`src/commands/territory/index.ts`) renders a text tree of the selected territory's, estate's or principals' repositories from `resolveTerritory`, with `--verbose` adding identity and root, and exits 1 while an unregistered member is reported. It has no JSON form.
- `ki repo audit` (`src/commands/repo/audit.ts`, `src/core/repository/operations/audit.ts`) evaluates each selected repository's declared skills and renders findings, but records nothing: no audit outcome survives the process.
- `ki work status --format json` publishes `ki/work-status/v1` from work folders; it has no per-island view.
- No `ki` code reads `maturity`.
- The Observatory (`apps-observatory.local/packages/evidence/src/ki.ts`) reads territories through `ki territory list` and `ki territory roots --null`, under a 10 s read limit per call.

## Decision

Planning settled the three open questions, which the record left to tools-ki as owner of its design:

1. **Surface: `ki territory show`.** It is already the per-island view of a territory, the estate or the principals, so it gains `--format text|json`, with JSON publishing the new `ki/territory/v1`, and its text view gains each island's maturity and health. `ki work status` stays a work-folder view.
2. **Health is recorded, not live.** A whole-repository `ki repo audit` (no `--skill`, `--staged` or `--paths`) records each repository's outcome in local state, and the reader reads that record. A live audit per read is rejected: a full `ki-repo` audit reads GitHub settings over the network and takes far longer than the Observatory's 10 s read limit. A record is per checkout and per machine, keyed by the physical root, at `$XDG_STATE_HOME/ki/audit-health/<sha256 of root>.json`, replaced atomically, so a newer attempt always replaces an older one.
3. **The record and its reading.** A completed audit records its FAIL and WARN finding counts, with a local-registration failure counted as a failure, since it fails the audit. A repository audit that throws records `incomplete`. Health reads `ruin` for an incomplete audit or any failure, `decline` for any warning, `sound` otherwise, and `unknown` when no readable record exists. Maturity reads the declared level when it is one of the four, and otherwise reports `null` with its declaration state, `absent`, `invalid` or `unreadable`, never a guessed level.

The `ki/territory/v1` shape:

```json
{
  "schema": "ki/territory/v1",
  "territory": { "id": "ki", "title": "Knowledge Islands" },
  "repositories": [
    {
      "key": "tools-ki",
      "identity": "knowledgeislands/tools-ki",
      "root": "/abs/path",
      "kind": "member",
      "maturity": { "level": "settled", "declaration": "declared" },
      "health": { "state": "decline", "audit": "completed", "observedAt": "2026-10-20T07:00:00.000Z", "failures": 0, "warnings": 2 }
    }
  ],
  "unregistered": []
}
```

`audit`, `observedAt`, `failures` and `warnings` are `null` when health is `unknown`; `failures` and `warnings` are also `null` for an `incomplete` audit.

## Steps

- [ ] Add an island-condition core module: the scale, the maturity reader over `.ki.toml`, the audit-health record writer and reader, and the health rule.
- [ ] Record the outcome from `auditRepositories` for a whole-repository audit, completed or incomplete, with `now` injected through `RepositoryOperationContext`.
- [ ] Add `--format text|json` to `ki territory show`: JSON publishes `ki/territory/v1`; the text tree adds each island's maturity and health; exit status is unchanged.
- [ ] CLI contract tests through `run(args, context)`: the four reader cases, an unrecorded island, declared, absent and invalid maturity, a filtered audit that records nothing, a newer incomplete attempt replacing an older clean one, and the JSON and text views.
- [ ] Add TERRITORY-008 to `docs/specs/territories.md`, update the user territory-selection guide, the README example if needed, the generated command inventory and manual, and the changelog.

## Files touched

- `src/core/territory/condition.ts` (new) and `src/core/territory/index.ts`
- `src/core/repository/operations/audit.ts`, `types.ts`; `src/commands/repo/operation-context.ts`
- `src/commands/territory/index.ts`
- `src/tests/cli/territory/condition.test.ts` (new)
- `docs/specs/territories.md`, `docs/guides/user/territory-selection.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`

## Verify

1. `ki territory show --format json` prints `ki/territory/v1` with each registered island's maturity and health, and the unregistered members, exiting 1 while any is unregistered.
2. Health follows the four reader cases: clean reads `sound`, warning-only `decline`, failure-plus-warning `ruin`, incomplete `ruin`; with no record it is `unknown` with null evidence.
3. A newer incomplete audit replaces an older clean record, and an audit with `--skill`, `--staged` or `--paths` records nothing.
4. Maturity reports a valid level as declared and an absent, invalid or unreadable declaration with a null level.
5. `bun run test:coverage` passes at 100%, `bunx tsc --noEmit` passes, and the repository's pre-commit and commit-msg hooks pass.

## Dependencies / blocks

Depended on [KI-HARNESS-GOV-223](https://github.com/knowledgeislands/ki-agentic-harness/blob/d100fb4dddf505693730db1cc6f8fb6f8a5daa92/docs/roadmap/KI-HARNESS-GOV-223-island-maturity-declaration.md), which defines the scale, the `.ki.toml` key and the decline rule, linked at a fixed revision so the link survives pruning. It is accepted in the local harness `main`. This reader imports no harness code: it reads `.ki.toml` and the recorded audit outcome, so it does not wait on the harness being pushed.

Serves the Observatory in apps-observatory.local, [KI-OBSERVA-BCN-008](https://github.com/knowledgeislands/apps-observatory.local/blob/80c1a1b0faaf05e025ed37a8c8fdd6c9e62d9fbf/docs/roadmap/KI-OBSERVA-BCN-008-beacon-signal-anatomy.md) for the Beacon's condition chips and [KI-OBSERVA-VIS-030](https://github.com/knowledgeislands/apps-observatory.local/blob/934da9c9d3659fcccb3f0b07577363cc819761b7/docs/roadmap/KI-OBSERVA-VIS-030-known-lands-chart.md) for the Known Lands chart, each at a fixed revision. Both draw condition as unknown until this lands, so neither is blocked by build order.

## Documentation impact

### Decision Records

None: the contract is specified in TERRITORY-008, and the owner's decisions are in the Observatory decisions log and the harness standard.

### Specifications

TERRITORY-008 in `docs/specs/territories.md`: the `ki territory show` condition view and its recorded-audit source.

### Guides

`docs/guides/user/territory-selection.md` gains the condition view and how health is recorded.

### Roadmap

None beyond this record.

## Discussion

Planning's open questions were which surface carries the signals, whether health is read live or from a recorded audit, and the contract name and version. They are answered under Decision. tools-ki owns priority and design.

### Planning, 20 October 2026

Promoted to Now and made Ready in the burn3-tools-ki run under Kris Brown's 20 October overnight grant, "get all of the tools burnt down ... getting the roadmaps down to zero", and PLANNED-READY a), "the old do need to move to Ready if possible, and we need to move them", once its own promotion condition held: KI-HARNESS-GOV-223 is done. The readiness checks pass: the boundary is the record's own, the dependency is met, and Verify is checkable through the public CLI seam.
