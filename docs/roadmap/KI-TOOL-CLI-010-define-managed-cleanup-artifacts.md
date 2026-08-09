---
id: KI-TOOL-CLI-010
title: Define managed cleanup artifacts
area: CLI
theme: cli
horizon: now
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 3de2f81360cf392c9a617f1b32f39149f21750b7
---

## Goal

Define a safe, recoverable ownership record for KI-managed artifacts so future cleanup can identify only state KI created.

## Context

Define a persisted, versioned KI-owned stale-artifact format so a future `ki cleanup` can safely identify, report, and remove only state it owns. The design must establish creation ownership, staleness evidence, concurrency protection, recovery behaviour, and deterministic reporting before any deletion behaviour is introduced.

## Boundary

This item does not change V1's non-mutating cleanup report, infer ownership from cache or transaction-looking paths, delete unconfigured harnesses or links, or introduce broad filesystem cleanup.

## Current state

Six persisted artifact families exist, none carrying an ownership record. Every producer and location below was re-checked against the code on 2026-08-09; three entries in the previous version of this table were wrong and are corrected here.

| Family | Producer | Location |
| --- | --- | --- |
| `.install-` staging | `registry.ts:241` | harness owner directory † |
| `.replace-` parked payload | `registry.ts:252` | harness owner directory † |
| Trade observation cursor | `trade-core.ts:895` | `paths.state/trades/observations/<sender>/<id>.ref` |
| Estate route diagram | `trade/routes.ts:189` | `paths.cache/estate-routes.html` |
| Installer receipt | `install.sh:293` ‡ | `paths.state/installation.toml` |
| Receipt staging file | `install.sh:298` ‡ | `paths.state/.installation.toml.XXXXXX` |

† Recovered concretely by `KI-TOOL-CLI-035`, delivered and pruned. `ki manage cleanup` reports both as eligible state and `ki manage repair` recovers them.

‡ Written by the installer, not by `ki`. Nothing under `src/` creates either file; `installation.ts` only reads the receipt, and `manage/update.ts` consumes what it read.

`ki manage cleanup` no longer reports `ELIGIBLE=0` unconditionally: it reports the two install families. It still proposes no delete verb of its own — recovery is `ki manage repair` — and the remaining four families are unreported until this design authorises it.

## Steps

- [x] Establish what a `.install-`/`.replace-` recovery actually needed to know — and treat that as the minimum the record must express. Answered by `KI-TOOL-CLI-035`: the destination the artifact belongs to, which nothing else on disk knew. The parked payload had to be renamed to carry it.
- [x] Re-ground the family table against the code. Corrected the cursor and receipt producers, and added the receipt staging file as a sixth family.
- [ ] Survey all six families, recording for each: producer, exact owned paths, lifetime, what evidence distinguishes a finished artifact from a live one, and who owns recovery. Record the answer per family in this document, as a table row plus a short paragraph where the row cannot carry it.
- [ ] Settle the ownership boundary the two installer-written families force. `ki` cannot write a manifest beside an artifact it does not create, so decide explicitly whether the installer is asked to write one, whether those two families stay outside the ownership model and are named as such, or whether `ki` adopts them on first read.
- [ ] Define the manifest: version, producing operation, owned paths, lifecycle state, and where it lives relative to its artifact. State which of the six families it can and cannot describe.
- [ ] Settle whether the manifest is written atomically with its artifact, and what a reader does with an unknown version — specifically that an unreadable or future-versioned manifest is a refusal rather than a licence to delete.
- [ ] Define staleness evidence and its refusal conditions: live, interrupted-recoverable, manually altered, foreign, and unreadable-manifest. For each, state the evidence that establishes it.
- [ ] Specify the deterministic dry-run report, naming each refusal reason exactly as an operator would see it.
- [ ] Propose the first concrete family to carry a manifest, as a separate implementation record. Do not implement it here.

## Files touched

- `docs/roadmap/KI-TOOL-CLI-010-define-managed-cleanup-artifacts.md` — the design itself. This item is design-only and is expected to touch nothing else.

No product code changes here. The successor implementation record owns `src/`; if this design finds it cannot be written without a code change, that is a finding to record rather than a licence to widen the scope.

## Verify

The design names every family in the table above, and for each states producer, owned paths, lifetime, staleness evidence, and recovery owner — including an explicit answer for the two the installer writes.

A reviewer can answer, for each refusal condition, what the report says and why deletion is withheld, without reading the code.

No delete verb is proposed, and no product code changes: `git diff --stat` for this item touches `docs/` alone.

`ki manage cleanup` behaves exactly as it does today when this item closes — it reports the two install families and proposes no deletion. The previous version of this criterion required `ELIGIBLE=0`, which `KI-TOOL-CLI-035` made unsatisfiable; it could not have been met by any design.

`bun run test` and `ki repo audit` stay green, which for a docs-only change means the roadmap and authoring rubrics pass.

## Dependencies / blocks

Nothing blocks this item. `KI-TOOL-CLI-035` recovered the first family concretely and has been delivered and pruned; its finding is recorded in the Steps above.

## Discussion

### Ownership record

Any candidate artifact format must identify its creating KI operation, version, exact owned paths, and lifecycle state. Cleanup may rely only on that persisted record, never on a filename pattern, cache location, or resemblance to a transaction directory.

The first design must also establish where the record lives, whether it is written atomically with its artifact, and how a later KI release establishes backwards-compatible reader behaviour without treating an unknown record as deletable state.

### Staleness and recovery evidence

The design must define positive staleness evidence, concurrent-operation exclusion, interruption recovery, and deterministic dry-run reporting before it can authorise a deletion. A missing or malformed ownership record is a refusal condition, not an invitation to infer intent.

Evidence should distinguish a completed artifact eligible for cleanup from an operation that is still live, interrupted but recoverable, manually altered, or outside KI ownership. A cleanup report needs to name each refusal reason so an operator can make a deliberate recovery decision rather than retrying blind.

### Candidate first deliverable

The first executable outcome is a versioned manifest and a read-only `ki cleanup` report over one concrete KI-created artifact family. It must prove containment before any delete verb is proposed, and its test fixture must cover interrupted writes, lock contention, foreign files, symlinks, malformed manifests, and a repeatable dry run.

### Promotion condition — met

Promote this item when a KI operation first needs to persist a versioned, recoverable managed artifact and can name its producer, owned paths, lifetime, and recovery owner. Until then, V1's explicit no-op cleanup result remains the correct safety boundary.

That condition is now met, which is why this item moved from `future` to `now`. `installHarness` persists two artifact families whose producer, owned paths and lifetime are all nameable — the `.install-` staging directory at `src/core/registry.ts:241` and the `.replace-` parked payload at `:249` — and an interrupted process leaves either behind. `KI-TOOL-CLI-035` records the live failure that follows: an orphan makes `discoverInstalledHarnesses` refuse the whole owner directory, while `ki manage cleanup` reports `ELIGIBLE=0` over exactly the state it exists to report.

Three other persisted families exist and belong in the survey this item owes: the trade observation cursors under `paths.state/trades/observations/`, the generated `estate-routes.html` under `paths.cache`, and the installer receipt read by `ki manage update`. None is currently covered by an ownership record.

### Relationship to `KI-TOOL-CLI-035`

`035` fixed the staging-directory failure directly and was deliberately not blocked on this design. Sequencing this item behind it paid off: recovery proved impossible until the parked payload carried its destination, because a harness payload does not record its own identity. That is the first concrete answer to what the ownership record must express, and it came from the fix rather than from reasoning about one.

### What grounding the table changed

Re-checking the six families against the code before planning changed the shape of the work twice.

The installer receipt is not produced by `ki`. `install.sh:293` writes it and `installation.ts` only reads it, so the ownership model this item defines cannot simply be extended over it — a manifest has to be written by whoever creates the artifact. That turns a survey row into a decision the design has to make explicitly, which is why it is now its own step.

The same line of the installer revealed a sixth family nobody had listed: `install.sh:298` stages the receipt through `mktemp "$state_dir/.installation.toml.XXXXXX"`, so an interrupted install leaves those files in the state directory. It is the same failure mode `KI-TOOL-CLI-035` fixed for `.install-` and `.replace-`, in a directory this item had not looked at.

The old `## Verify` also required that `ki manage cleanup` still report `ELIGIBLE=0` when this item closes. `KI-TOOL-CLI-035` made that false in delivery — cleanup now reports two families — so the criterion had become unsatisfiable by any design. It is replaced by the behaviour that actually matters: cleanup is unchanged and still proposes no deletion.
