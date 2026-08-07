---
id: KI-TOOL-CLI-022
title: Weight progress by duration
theme: cli
horizon: now
status: in-progress
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make the repository-operation progress bar advance in proportion to how long each rubric item actually takes, by learning per-item durations from observation and persisting them across runs, so that the completed fill and the in-flight band both tell the truth about remaining work.

## Context

`KI-TOOL-CLI-021` rebuilds the progress renderer but weights every rubric item equally, because nothing in the rubric contract says which items are expensive. A single `ki repo audit --skill ki-engineering` run spans items ranging from a single `lstat` to a full test invocation, so a uniformly weighted bar leaps through the cheap majority and then parks for the remainder of the run.

Observation is therefore the only sound basis, and it has to be persisted, because each item runs at most once per invocation — within a single run the weights never inform the item they describe.

## Boundary

This item does not change the progress renderer's composition, zones, or command grammar, all of which are settled by `KI-TOOL-CLI-021`. It does not add a user-facing command to inspect or clear the cache, does not ship a checked-in baseline table, and does not make the cache a correctness dependency: absent or unreadable data must degrade silently to uniform weighting.

## Current state

There is no static signal available to fix this. `commands` lives on `ConformProposal`, a value produced at runtime by a conform action, not on `RubricItem`; an audit item that shells out does so inside its own `audit.run`, invisible to the declaration. A rubric could be extended to declare an expected cost, but that would be a portable contract change owned by KI Specifications and would still be a guess, since the same item costs seconds in a small repository and minutes in a large one.

## Steps

- [ ] Record the wall-clock duration of each rubric item through the existing injected clock on the context, using the `onItemStart` and `onItemComplete` hooks introduced by `KI-TOOL-CLI-021`.
- [ ] Persist durations to a versioned JSON file under the resolved cache path, smoothed so a single anomalous run does not dominate, keyed by repository together with skill identity and item code.
- [ ] Write the file once at the end of a run rather than per item, and treat a write failure as non-fatal and silent.
- [ ] Consume the recorded durations as bar weights, falling back to uniform for any item with no recorded observation, so a first run in a repository behaves exactly as it does today.
- [ ] Degrade silently to uniform weighting when the file is missing, unreadable, malformed, or written by a future schema version.
- [ ] Cover the cold-start, warm, corrupt-file, and version-mismatch paths with CLI tests seeded through the sandbox home.

## Files touched

- `src/core/repository-reporting.ts` — weight consumption in the tracker.
- A new module owning the duration store, alongside the existing core modules.
- `src/core/paths.ts` if the cache path needs a named accessor.
- `src/tests/cli/repo/` — cold-start, warm, and degradation tests.

## Verify

The store must be safe to delete at any time, and deleting it must only cost accuracy on the next run. Tests seed the cache through the sandbox's home area, as the update tests already do for installation state; note that the sandbox sets only `HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME`, so the cache path resolves beneath the sandbox home rather than a dedicated area.

Because the sandbox stubs the clock, recorded durations in tests are deterministic; a monotonic stub gives non-zero, predictable weights. Coverage remains at 100% over product code, which means the corrupt-file and version-mismatch fallbacks each need a reachable test rather than a guard comment.

Manual confirmation: run an audit twice in this repository against a skill with a subprocess-backed item, and confirm the second run's bar advances proportionally, with a visibly wide in-flight band while the expensive item runs.

## Dependencies / blocks

Nothing blocks this item. `KI-TOOL-CLI-021` delivered both the `onItemStart` hook that makes per-item timing observable and the three-zone bar whose in-flight band width this item makes meaningful, and has since been accepted and pruned, so the dependency this record carried no longer names a live item.

## Discussion

### Why per-repository keying

The same rubric item has entirely different costs in different repositories, since most expensive items delegate to a repository's own toolchain. A weight table keyed only by skill and item code would be actively misleading on the second repository it met.

### Why no shipped baseline

A committed table of typical durations would improve the very first run, but it would be measured on one machine against one repository, would need re-measuring whenever rubrics change, and would produce a confidently wrong bar wherever it was stale. An honestly uniform first run is preferable, and it is exactly today's behaviour, so nothing regresses.

### Why smoothing rather than last-observed

A single run perturbed by a cold filesystem cache or a competing process would otherwise set the weight for the next run. Smoothing across observations keeps the weights stable while still tracking genuine changes in a repository's cost profile.
