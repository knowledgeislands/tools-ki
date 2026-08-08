---
id: KI-TOOL-CLI-035
title: Recover interrupted install orphans
theme: cli
horizon: now
status: ready
blocks: [KI-TOOL-CLI-010]
blocked-by: []
baseline-ref: null
---

## Goal

Stop an interrupted harness install from disabling every command that discovers installed harnesses, so a killed `ki harness install` leaves a recoverable installation rather than one that refuses to describe itself.

## Context

`installHarness` extracts each download into a staging directory before promoting it: `mkdtemp(join(ownerDirectory, '.install-'))` at `src/core/registry.ts:241`, renamed onto the destination once its capabilities verify. Replacement adds a second, `.replace-${randomUUID()}` at `:249`, which parks the previously installed payload while the new one moves into place.

Both are cleaned up on every in-process path — the `catch` at `:261` removes the staging directory, and `:259` removes the parked payload on success. Neither survives an ordinary failure. What neither handles is the process not reaching its own cleanup: `SIGINT` during a slow extraction, a crash, a full disk, a lost session. The staging directory then remains in the harness owner directory.

That residue is not inert. `discoverInstalledHarnesses` walks each owner directory and rejects any entry failing `harnessComponent.test` (`src/core/harness.ts:206-208`), and a `.install-` or `.replace-` name fails it by its leading dot. The result is a thrown `installed harness <owner> contains an unsafe name entry` and exit 1, verified directly:

```text
$ mkdir "$XDG_DATA_HOME/ki/harnesses/knowledgeislands/.install-abc123"
$ ki harness list
ki: error: installed harness knowledgeislands contains an unsafe name entry
$ ki manage list
ki: error: installed harness knowledgeislands contains an unsafe name entry
```

Removing the directory restores both commands immediately. The guard is doing its job — an unexpected entry in the harness tree genuinely is unsafe to treat as a harness — but it cannot distinguish a foreign intruder from this repository's own interrupted work, so it refuses both identically.

Three things make this worse than untidiness:

- **The diagnostic names neither the path nor the remedy.** It reports the owner, not the offending entry, so the operator is told something is unsafe without being told what or where. The directory is hidden, so `ls` does not show it.
- **The blast radius is wide.** `discoverInstalledHarnesses` has fourteen call sites, including `ki manage doctor`, `ki manage repair`, `ki manage update`, `ki repo audit` and `ki repo conform`. The commands for diagnosing and repairing a broken installation are among those disabled by the condition they exist to repair. Failure was verified on `ki harness list` and `ki manage list`; the remaining sites are to be confirmed during implementation rather than assumed.
- **`ki manage cleanup` reports `ELIGIBLE=0`** with the orphan present. The command whose stated purpose is to report eligible KI-managed stale state is blind to the clearest instance of it.

The `.replace-` case is the more serious of the two, because the interruption window at `:249-253` is one where the parked directory holds the only verified copy of the previously installed payload. Recovery there is restoring it, not deleting it, and the two cases must not be treated alike.

## Boundary

This item owns the recognition and recovery of this repository's own interrupted staging directories, and the diagnostic when an entry cannot be recovered. It does not relax `harnessComponent`, weaken the unsafe-entry guard for genuinely foreign entries, introduce a general `ki cleanup` delete verb, or define the persisted ownership record — `KI-TOOL-CLI-010` owns that design, and this item is deliberately the narrower fix that does not wait on it.

Whether recovery happens automatically on discovery or only under an explicit command is the open decision below, and is settled before implementation rather than during it.

## Current state

`src/core/registry.ts:241` and `:249` create the two directory families. `src/core/harness.ts:200-211` rejects them. `src/commands/manage/cleanup.ts` reports nothing about them. No test covers an orphaned staging directory, because no in-process CLI invocation can leave one — provoking it needs a directory planted directly in the sandbox data root, which is an ordinary on-disk fixture rather than fault injection.

## Steps

- [ ] Confirm which of the fourteen `discoverInstalledHarnesses` call sites actually fail with an orphan present, and record the ones that do not.
- [ ] Settle the open decision below on automatic versus explicit recovery.
- [ ] Distinguish this repository's own staging names from a foreign unsafe entry at the point of discovery.
- [ ] Recover a `.replace-` orphan by restoring the parked payload when its destination is absent, never by deleting it.
- [ ] Report an unrecoverable entry with its path and the action available, rather than the owner alone.
- [ ] Cover both orphan families through the CLI, including the restore path and a genuinely foreign entry that must still be refused.

## Files touched

- `src/core/harness.ts` — the discovery guard and its diagnostic.
- `src/core/registry.ts` — staging naming, if recovery needs it to be recognisable.
- `src/commands/manage/cleanup.ts` — reporting an orphan as eligible state.
- `src/tests/cli/harness/`, `src/tests/cli/manage/` — the orphan fixtures.

## Verify

`bun run test:coverage` at 100% on all four metrics. A planted `.install-` orphan no longer fails `ki harness list`; a planted `.replace-` orphan whose destination is absent restores the parked payload; an entry that is neither is still refused, now naming its path.

## Dependencies / blocks

Nothing blocks this item. It blocks `KI-TOOL-CLI-010` only in sequence, not in substance: `010` designs the general ownership record, and this item should land first so that design is informed by a concrete recovered family rather than a hypothetical one.

## Discussion

### Why this is separate from `KI-TOOL-CLI-010`

`010` asks for a versioned, persisted ownership manifest covering every KI-created artifact family, and that is the right long-term answer. It is also a design item with a wide surface, and this defect is live now: any interrupted install disables harness discovery until the operator finds and removes a hidden directory on the strength of a message that names neither. Waiting for the general record to fix the specific failure gets the ordering backwards. This item fixes the failure; `010` generalises it.

### The open decision

Recovery could run automatically inside `discoverInstalledHarnesses`, or only under `ki manage repair` with discovery merely reporting better.

Automatic recovery makes the failure invisible, which is right for `.install-` — an unpromoted staging directory has no value and its removal loses nothing. It is wrong for `.replace-`, where the parked directory may hold the only verified payload and silent handling risks destroying it during an unrelated read-only command. Discovery is called by read-only commands, and having `ki manage list` mutate the harness tree as a side effect is a poor bargain regardless of which family it acts on.

The provisional recommendation is therefore asymmetric: recognise both families during discovery so no command fails on either, remove nothing implicitly, restore a `.replace-` orphan only under an explicit `ki manage repair`, and have `ki manage cleanup` report both as eligible state. That keeps every read path pure and leaves each destructive or restorative act to a command the operator invoked deliberately. It needs confirming before implementation.
