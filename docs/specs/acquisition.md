# Retired knowledge package acquisition — ACQUIRE

Acquisition has moved to the assistant's `ki-muninn` (krisb/assistant), which now owns ChatGPT packaging and Granola acquisition. The `ki acquire` command, its adapters and their Harness metadata parsing are removed from `ki`. Running `ki acquire` prints one line naming the new home and exits 1, until the `ki-<name>` extension mechanism lets `ki muninn` run it; `src/tests/cli/root/help.test.ts` — `answers a moved command with one line naming its new home` verifies that pointer. See the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Retired requirements

### ACQUIRE-001 — ~~Deterministic ChatGPT package layout~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-002 — ~~Safe capture validation~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-003 — ~~No-write dry run~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-004 — ~~Read-only provider boundary~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-005 — ~~Complete identity enumeration~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-006 — ~~Explicit receiver reconciliation~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-007 — ~~Content-addressed Granola KEP publication~~ (deprecated)

Deprecated in 2026-09-16 when receiver-local meeting Markdown and component checkpoints replaced immutable per-version KEP directories.

### ACQUIRE-008 — ~~Pre-ledger package recovery~~ (deprecated)

Deprecated in 2026-09-16 when the schema-three in-progress journal became the authoritative interrupted-run recovery mechanism.

### ACQUIRE-009 — ~~Granola KEP source projections~~ (deprecated)

Deprecated in 2026-09-16 when explicit Markdown fields, component hashes, transcript state, and disposition evidence replaced KEP projection bundles.

### ACQUIRE-010 — ~~Verified adapter declarations~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-011 — ~~Action-first selection~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-012 — ~~Invocation-property isolation~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-013 — ~~Separate detail and transcript observations~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-014 — ~~Atomic resumable generations~~ (deprecated)

Deprecated on 2026-10-20 when Granola acquisition stopped keeping a ledger, checkpoint or journal; ACQUIRE-019 governs the capture as the only record, and an interrupted run is simply repeated.

### ACQUIRE-015 — ~~Post-acquisition disposition~~ (deprecated)

Deprecated on 2026-10-20 with the checkpoint that carried dispositions; Acquired-folder membership now marks a meeting as dealt with.

### ACQUIRE-016 — ~~Governed local reset~~ (deprecated)

Deprecated on 2026-10-20 when `ki acquire reset`, `status` and `reconcile` were removed with the local acquisition state they governed.

### ACQUIRE-017 — ~~MCP screenshot preservation~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-018 — ~~Explicit progress markers~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

### ACQUIRE-019 — ~~Capture as the only record~~ (deprecated)

Deprecated on 2026-11-05 when acquisition moved out of `ki` to the assistant's `ki-muninn`, which now owns this behaviour.

## Gaps

No unbuilt candidate behavior is in scope for this area.
