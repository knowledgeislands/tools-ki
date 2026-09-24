# Canonical batch records

Use `ki batch` for the deterministic file mechanics around one already-approved, exact set of Ready roadmap items. The commands create and verify the authority envelope, bind a run to its approved payload, append caller-supplied item results, and record caller-proven completion. They do not select work, infer conversational authority, run an agent, change roadmap lifecycle, accept or prune items, push, or release.

## Prepare an approved batch

From the receiving repository, provide every work item explicitly and in dependency order:

```sh
ki batch prepare \
  --item KI-EXAMPLE-001 \
  --item KI-EXAMPLE-002 \
  --approved \
  --authority-mode reviewed-items \
  --expires-at 2099-01-01T18:00:00Z \
  --completion-target awaiting-review
```

Replace the illustrative identifiers and expiry with the approved Ready items and active window for the selected repository. `--approved` records an assertion supplied by the caller; it does not prove approval. Use `--authority-mode outcome --authority-evidence <text>` only when current human outcome authority covers the complete selected set. New records are allocated beneath `+/_BATCHES/`, carry `policy: safe-local-v1`, and protect the approved fields and pre-ledger body with a SHA-256 digest.

All item identifiers must resolve to canonical Ready records in the selected repository. Repeated identifiers and dependency-reversed order are rejected. Use `--repo <path>` to select a repository other than the repository containing the current directory.

## Validate and record a run

Validate without writing:

```sh
ki batch validate KI-EXAMPLE-BATCH-001
```

Start the run before implementation begins. The command derives the first run identifier and binds it to the approved payload; it does not execute the work:

```sh
ki batch run KI-EXAMPLE-BATCH-001
```

After the process-owned implementation has produced an item result, append that exact result and its evidence:

```sh
ki batch run KI-EXAMPLE-BATCH-001 \
  --item KI-EXAMPLE-001 \
  --result awaiting-review \
  --baseline 0123456789abcdef0123456789abcdef01234567 \
  --result-commit 89abcdef0123456789abcdef0123456789abcdef
```

`--result` accepts `awaiting-review`, `done`, `parked`, or `stopped`. A full result commit is mandatory for `awaiting-review` and `done`; `--baseline` accepts a full commit or `—`. The named roadmap record must already carry the compatible lifecycle status. An optional `--exception <text>` records one concise material exception.

## Close the record

Close only after every named item has a ledger result matching the approved all-item target and its canonical roadmap record already carries that target status:

```sh
ki batch close KI-EXAMPLE-BATCH-001 \
  --completion-target awaiting-review \
  --evidence-commit 89abcdef0123456789abcdef0123456789abcdef
```

The evidence commit must resolve in the repository. Closing appends structural evidence to the batch record; it never performs acceptance. Human approval and `ki-accept` remain responsible for moving review-ready work to `done`.

## Retained records and recovery

`validate` checks an open current record against live selected work and its execution window. After closure, it checks the exact selected work state recorded in the evidence commit, so later pruning and expiry do not invalidate the archived outcome. Missing or inconsistent historical evidence still fails closed.

`validate` can integrity-check retained records written under the earlier batch shape even after their execution window has expired. Those records remain read-only: `run` and `close` refuse to upgrade or rewrite them. An expired current record, altered approved payload, mismatched run binding, non-canonical path, symbolic link, or cross-repository identity fails closed. Correct the source authority or create a newly approved batch rather than editing a protected payload in place.

## Clean up inactive records

A batch record is a temporary authority envelope, not a durable history store. Once a run is inactive and every useful outcome or follow-up has been routed to its canonical work, decision, guide, specification, trade, or commit evidence, remove the record immediately. Git retains the committed execution evidence.

If useful follow-up remains, route it before cleanup. Seven days after inactivity is the overdue deadline for making that decision, not a minimum retention period: record that no useful follow-up remains or move the useful material to its owner, then remove the batch in the same review cycle. Active, malformed, unsafe, or incompletely evidenced records remain in place until their state can be resolved safely.
