---
id: KI-TOOL-CLI-010
title: Define managed cleanup artifacts
area: CLI
theme: cli
horizon: now
status: in-progress
blocks: [KI-TOOL-CLI-037]
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

Eight persisted artifact families exist, none carrying a managed ownership record. Every producer and location below was re-checked against the code on 2026-08-09; the original six-family inventory had omitted the `uninstallHarness` parking directory and the installer-script staging file.

| Family | Producer | Owned path |
| --- | --- | --- |
| Install staging | `installHarness` | `data/harnesses/<owner>/.install-*` † |
| Parked replacement | `installHarness` | `data/harnesses/<owner>/.replace-<uuid>-<name>` † |
| Uninstall parking | `uninstallHarness` | `data/harnesses/<owner>/.uninstall-<uuid>` † |
| Observation cursor | `observeTradePreparation` | `state/trades/observations/<sender>/<id>.ref` |
| Estate route diagram | `trade routes list --estate --html` | `cache/estate-routes.html` |
| Installer receipt | `install.sh` | `state/installation.toml` ‡ |
| Receipt staging | `install.sh` | `state/.installation.toml.XXXXXX` ‡ |
| Installer-script staging | `install.sh` | `state/installer/.install.sh.XXXXXX` ‡ |

† `KI-TOOL-CLI-035` established current recovery for install staging and parked replacement. `ki manage cleanup` reports those two families; `ki manage repair` performs their recovery.

‡ Written by the installer, not by `ki`. Nothing under `src/` creates these files; `installation.ts` only reads the receipt, and `manage/update.ts` consumes what it read.

`ki manage cleanup` no longer reports `ELIGIBLE=0` unconditionally: it reports the two recoverable install families. It still proposes no delete verb of its own — recovery is `ki manage repair` — and the remaining families are unreported until a later implementation adopts the design below.

## Survey

### Harness installation and removal

`installHarness` creates an `.install-*` directory only after the archive is fetched. It lives until promotion to the destination or exception cleanup; an interrupted process leaves an unpromoted extraction. The current positive evidence is its location beneath a syntactically valid harness owner and its prefix. `ki manage repair` owns removal, while `ki manage cleanup` only reports it.

Replacement moves the prior verified payload to `.replace-<uuid>-<name>` before promoting the staged payload. It lives only across that replacement window. Its name carries the destination because the payload itself has no self-identity: when the destination is absent, `ki manage repair` restores it; when present, repair removes it; an old-format parked name without a destination is refused.

`uninstallHarness` similarly parks a payload at `.uninstall-<uuid>` while it validates and removes it. A process interrupted after the rename can leave the only known payload at that path, but no discovery or recovery currently recognises it. It is a CLI-created family and belongs in the future ownership model; it is not safe for the current prefix-based recovery to remove.

### Trade observation cursor

Observation writes one committed reference per sender and trade identity after computing the current output. It persists indefinitely as comparison state for the next observation; an absent, malformed, or incomparable reference falls back to verbatim output and is overwritten only after the observation succeeds. The trade observation operation owns its recovery. It is state, not temporary residue, so it is not stale merely because of age.

### Estate route diagram

The HTML estate diagram is a fixed, regenerable cache file rewritten in place by `ki trade routes list --estate --html`. It has no recovery data and no accumulation behaviour: rerunning that command replaces it. The route command owns regeneration. A future manifest can mark a superseded diagram as retired, but a missing diagram is never an error or evidence for deletion elsewhere.

### Installer receipt and stages

The installer writes the durable receipt after it has copied an installer script through `state/installer/.install.sh.XXXXXX` and staged the TOML through `state/.installation.toml.XXXXXX`. The receipt lives for as long as that distribution owns the executable; `ki manage update` validates it before calling the recorded installer. The installer, rather than `ki`, owns recovery for all three paths. `ki` must neither infer ownership from them nor adopt them when it reads a receipt.

## Design

### Ownership boundary

The managed-artifact format applies only to artifacts created by `ki` itself: install staging, parked replacement, uninstall parking, observation cursors, and the estate route diagram. Installer-created receipt state remains outside this model until the installer independently implements an equivalent record. Existing unrecorded artifacts remain outside the model too; no manifest is reconstructed from a filename, cache path, or resemblance to a transaction.

### Versioned manifest

Each record lives in the KI state directory at `managed-artifacts/<uuid>.toml`, outside the artifact it describes, so a moved or deleted artifact does not take its ownership evidence with it. A version-one record has this minimum shape:

```toml
schema = 1
id = "<uuid>"
operation = "harness-install"
state = "creating"
paths = ["<absolute physical artifact path>"]
lock = "<absolute managed-artifacts lock path>"
```

`schema`, `id`, `operation`, `state`, `paths`, and `lock` are mandatory. `paths` is a non-empty, duplicate-free list of physical absolute paths beneath the KI data, cache, or state roots selected for that operation. `state` is one of `creating`, `active`, `recoverable`, or `retired`: it records the operation's lifecycle, not a claim that a path is safe to remove. A record names no user-selected or repository-owned path.

### Atomicity and concurrent readers

The producer atomically publishes a `creating` manifest in `managed-artifacts/` before creating its artifact, then atomically replaces that same manifest as its state advances. Temporary manifest bytes are written and renamed within the manifest directory. A producer marks a finite artifact `retired` before its physical removal, then removes the manifest only after the physical artifact is gone. A crash therefore leaves either no ownership record or one complete, versioned record; it never makes a partial record deletion authority.

Every record has one exclusive operation lock at its declared `lock` path. A cleanup reader must acquire that lock non-blockingly before it reasons about a record; an unavailable, unsafe, or unverifiable lock is a refusal. The first implementation must choose and test a portable lock primitive. Until it can prove that a dead producer has released its lock, it must report rather than treat an apparently old record as stale.

### Staleness and refusal conditions

A later read-only cleanup report may call an artifact a candidate only when a schema-one `retired` record is regular, the lock is acquired, every declared path is physical and beneath its approved root, and every path matches the declared artifact type. It must withhold deletion authority in these cases:

- `live` — the operation lock is held or cannot be safely inspected.
- `interrupted-recoverable` — a lock-free `creating` or `recoverable` record remains; the named operation's recovery owner, not cleanup, decides the next action.
- `manually-altered` — a declared path is absent, changes type, is a symlink, escapes its approved root, or no longer matches the record's artifact shape.
- `foreign` — a manifest declares a path outside its operation's approved KI roots or an artifact has no manifest. Unrecorded filesystem entries are not scanned or reported as cleanup candidates.
- `unreadable-manifest` — the manifest or lock is not a regular safe file, cannot be parsed, omits required fields, repeats a path, or uses an unknown schema. A later schema version is specifically `unreadable-manifest`, never an implicit compatibility promise.

### Deterministic dry-run report

The future report scans only the manifest directory in lexical manifest-ID order. It renders one record per candidate or refusal, with no mutation and no delete command surface:

```text
artifact <id> [candidate] retired harness-install · would remove <path>
artifact <id> [refused: live] operation lock is held
artifact <id> [refused: interrupted-recoverable] use ki manage repair
artifact <id> [refused: manually-altered] declared path is not a physical directory
artifact <id> [refused: foreign] declared path is outside the KI data root
artifact <manifest path> [refused: unreadable-manifest] schema 2 is unsupported
```

The summary counts `CANDIDATES` and each refusal class. The existing `ki manage cleanup` remains unchanged until a successor explicitly implements this report; no deletion verb is introduced by this design.

### First implementation record

`KI-TOOL-CLI-037` is the first proposed implementation: it will attach a schema-one manifest to the finite `.install-*` harness staging family and add read-only candidate/refusal reporting. It must preserve the current `ki manage repair` recovery route, prove lock and interruption handling, and leave parked replacement, uninstall parking, cursor, diagram, and installer state untouched.

## Steps

- [x] Establish what a `.install-`/`.replace-` recovery actually needed to know — and treat that as the minimum the record must express. Answered by `KI-TOOL-CLI-035`: the destination the artifact belongs to, which nothing else on disk knew. The parked payload had to be renamed to carry it.
- [x] Re-ground the family table against the code. Corrected the cursor and receipt producers, and added the receipt staging file as a sixth family.
- [x] Survey all known families, recording each producer, exact owned paths, lifetime, finished-versus-live evidence, and recovery owner. The survey corrected the inventory from six to eight families.
- [x] Settle the installer boundary: installer-owned receipt and staging state stays outside the KI ownership model; `ki` does not adopt it on read.
- [x] Define the manifest: schema, producer operation, owned paths, lifecycle state, and state-directory location. State which families it can and cannot describe.
- [x] Settle atomic publication and unknown-version handling: producers atomically replace records in the manifest directory; incomplete, unreadable, and future-versioned records are refusals.
- [x] Define staleness evidence and refusal conditions: live, interrupted-recoverable, manually altered, foreign, and unreadable-manifest each has a named report outcome.
- [x] Specify the deterministic read-only report, including exact candidate and refusal labels.
- [x] Propose the first concrete family as `KI-TOOL-CLI-037`; do not implement it here.

## Files touched

- `docs/roadmap/KI-TOOL-CLI-010-define-managed-cleanup-artifacts.md` — the design itself.
- `docs/roadmap/KI-TOOL-CLI-037-track-install-staging-artifacts.md` and `docs/roadmap/_ISSUES.md` — the separately proposed first implementation record and its allocated issue number.

This item is documentation-only. The successor implementation record owns `src/`; if this design finds it cannot be written without a code change, that is a finding to record rather than a licence to widen the scope.

## Verify

The design names every family in the table above, and for each states producer, owned paths, lifetime, staleness evidence, and recovery owner — including an explicit answer for the three the installer writes.

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

`KI-TOOL-CLI-037` is the first executable outcome: a versioned manifest and read-only `ki manage cleanup` report over the finite install-staging family. It must prove containment before any delete verb is proposed, and its test fixture must cover interrupted writes, lock contention, foreign paths, symlinks, malformed manifests, and a repeatable dry run.

### Promotion condition — met

Promote this item when a KI operation first needs to persist a versioned, recoverable managed artifact and can name its producer, owned paths, lifetime, and recovery owner. Until then, V1's explicit no-op cleanup result remains the correct safety boundary.

That condition is met: `installHarness` persists finite staging and replacement families whose producer, paths, lifetime, and current recovery owner are all known. `KI-TOOL-CLI-035` proved why that evidence matters: an orphan can make harness discovery refuse an owner directory, while `ki manage cleanup` can only report the narrow families current recovery understands. The survey now records the complete eight-family surface known to these producers.

### Relationship to `KI-TOOL-CLI-035`

`035` fixed the staging-directory failure directly and was deliberately not blocked on this design. Sequencing this item behind it paid off: recovery proved impossible until the parked payload carried its destination, because a harness payload does not record its own identity. That is the first concrete answer to what the ownership record must express, and it came from the fix rather than from reasoning about one.

### What grounding the table changed

Re-checking the inventory against the code changed the shape of the work twice.

The installer receipt is not produced by `ki`. `install.sh:293` writes it and `installation.ts` only reads it, so the ownership model this item defines cannot simply be extended over it — a manifest has to be written by whoever creates the artifact. That turns a survey row into a decision the design has to make explicitly, which is why it is now its own step.

The re-check also found two previously unlisted families: `uninstallHarness` parks a payload at `.uninstall-<uuid>`, and `install.sh:297` stages a copied installer script at `state/installer/.install.sh.XXXXXX`. Neither is safe for the existing prefix-based recovery, so both are explicit survey rows and future ownership-model candidates.

The old `## Verify` also required that `ki manage cleanup` still report `ELIGIBLE=0` when this item closes. `KI-TOOL-CLI-035` made that false in delivery — cleanup now reports two families — so the criterion had become unsatisfiable by any design. It is replaced by the behaviour that actually matters: cleanup is unchanged and still proposes no deletion.
