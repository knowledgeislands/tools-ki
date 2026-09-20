# Acquire Granola meetings

This guide is for operators acquiring Granola meeting evidence into a registered Knowledge Islands repository. It explains how to activate the repository adapter, run read-only imports, inspect resumable state, and recover safely; the accepted behavior is recorded in the [acquisition specification](../../specs/acquisition.md).

## Prepare the source connection

The Granola adapter uses the locally installed `mcporter` executable and a configured server named `granola`. Authenticate that connection before acquisition:

```sh
mcporter auth granola
```

Acquisition passes `--no-oauth` on every provider call. Missing or expired credentials fail visibly instead of opening a browser. Tokens never enter repository configuration, staged documents, journals, or checkpoints.

## Activate the repository adapter

The installed Harness must publish a verified `ki-acquire-granola` skill declaration, and the repository must both select that Harness and declare the skill. Inspect the current repository context first:

```sh
ki acquire list
```

If the adapter is available but not enabled, use the existing skill workflow suggested by the listing, then add repository selectors to `.ki.toml`:

```toml
[skills.ki-acquire-granola]
folder_ids = ["stable-granola-folder-id"]
unfoldered = true
residual = true
```

`folder_ids` selects stable folder IDs, not names. `unfoldered` accepts identities proven to be outside every live folder. `residual` accepts meetings whose folders have no other configured receiver. At least one selector is required.

Only one receiver should normally select a folder. Where duplication is deliberate, every participating receiver names the folder ID explicitly:

```toml
duplicate_folder_ids = ["stable-granola-folder-id"]
```

User-skill activation alone does not enable acquisition for a repository. The repository declaration remains required and must resolve through one of its declared Harnesses.

## Run and inspect acquisition

From the receiving repository, run:

```sh
ki acquire import --adapter granola
```

The default interval is `1970-01-01` through the current UTC date. Bound an inclusive interval when required:

```sh
ki acquire import --adapter granola --since 2023-01-01 --until 2026-09-16
```

Select another registered receiver without changing directory:

```sh
ki acquire import --adapter granola --repo /path/to/repository --since 2023-01-01
```

Use `--dry-run` to perform discovery, routing, provider reads, and validation without writing repository state. Use the single-adapter override only when transcripts must be re-read deliberately:

```sh
ki acquire import --adapter granola --refresh-transcripts
```

That override is rejected with `--all`. Routine imports re-read mutable meeting detail but reuse a verified transcript checkpoint. A transcript is fetched when the meeting is new, no successful transcript checkpoint exists, an unavailable transcript remains within its bounded retry policy, or refresh is explicit.

Inspect local state without contacting Granola:

```sh
ki acquire status --adapter granola
ki acquire reconcile --adapter granola
```

`status` reports checkpoint, transcript, disposition, and journal summaries. `reconcile` additionally verifies the checkpoint's staged or disposed document evidence.

## Understand staged evidence and recovery

Meeting Markdown is staged beneath `+/_ACQUIRE/granola/`. The authoritative `ledger.json` records one completely verified generation, with separate detail and transcript hashes and transcript retry state. The in-progress `journal.json` records the selected identities, verified staged paths and component hashes, failures, retry state, and remaining work.

Both state files are replaced atomically. A failed run leaves the last committed checkpoint authoritative and keeps its journal for the next run. Rerunning the same command revalidates mutable detail and reuses already verified immutable transcripts and staged documents. A stale, corrupt, differently bound journal fails closed and is never treated as completion.

Moving a staged document is not corruption when its checkpoint disposition records the new canonical destination and matching document hash. Supported dispositions distinguish staged, retained, harvested locally, routed through `ki-trades`, superseded, and awaiting review evidence. An unchanged disposed source is not staged again; later mutable-detail change creates an amendment awaiting renewed review.

## Reset local acquisition state

A reset never changes Granola. First preview the plan:

```sh
ki acquire reset --adapter granola
ki acquire reset --adapter granola --source <meeting-uuid>
ki acquire reset --adapter granola --source <meeting-uuid> --component transcript
ki acquire reset --adapter granola --rebuild
```

Apply the exact reviewed plan by repeating it with `--confirm`. Component reset requires `--source`; `--rebuild` cannot be combined with a source or component.

## Safety boundary

Granola operations are limited to account, folder, meeting-list, meeting-detail, and transcript reads. Acquisition never tags, edits, archives, deletes, or moves provider data; does not automate a browser; does not harvest knowledge; and does not write another repository. Folder membership is routing evidence rather than canonical classification, explicit provider omissions remain omissions, and conflicting receiver mappings fail closed.
