# Acquire Granola meetings

Use this guide to acquire Granola meeting evidence into a registered Knowledge Islands repository. It explains how to activate the repository adapter, run read-only imports, inspect resumable state, and recover safely without allowing provider access to mutate the source.

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

## Use one temporary inbox for several territories

A receiver may select several folder IDs. For a central capture repository, declare a safe repository-relative `capture_root` and an explicit territory name for every selected ID. Granola display titles may change without changing those stable IDs. Several folders may map to the same territory.

```toml
[skills.ki-acquire-granola]
folder_ids = ["folder-one", "folder-two"]
capture_root = "captures"
unfoldered = "flag"
residual = "flag"

[skills.ki-acquire-granola.folder_territories]
folder-one = "personal"
folder-two = "legal"
```

`"flag"` reports unfoldered or unmatched identities during each run and saves their listing metadata in `.acquire/granola/flagged.json`; their meeting details and transcripts are not acquired. With `residual = "flag"`, unmatched live folders are also reported even when empty. A dry run reports them without saving files. The operator can assign a source folder or explicitly revise the receiver policy before a later run. `true` still acquires those identities; `false` does not select them. Conflicting receivers still fail closed.

Each selected meeting UUID produces one package at `captures/<territory>/granola/<date>--<topic>--<uuid>/meeting.md`. All source folder IDs and titles and the explicit territory names remain in the document. A package keeps its original path when its title or date changes. A changed territory classification preserves the complete package, including images and source variants, until the new checkpoint commits; the old active package is then removed. Meetings belonging to several territories go into `captures/_review/granola/` for an operator decision; they are not copied once per folder. Meetings with any unmapped folder membership, or without an explicit territory, also use `_review` if their receiver policy acquires them.

The central checkpoint and recovery journal live in `.acquire/granola/`, outside capture packages. After verifying preservation in the owning knowledge base or declared source store, record the matching handled disposition before removing a package. Keep the technical checkpoint: it prevents an unchanged handled source being staged again. If its local transcript copy is absent, a later import re-reads the provider transcript to verify the stored source hash; a provider omission fails visibly, and an amendment becomes awaiting review. This is on-demand acquisition; configuration does not create a schedule or automate reconciliation.

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

`status` reports checkpoint, transcript, disposition, image-manifest, and journal summaries. `reconcile` additionally verifies the checkpoint's staged or disposed document evidence and every acquired image checksum.

The account checkpoint binds the connected account, active workspace and note-access scopes. The stable account projection is `email`, `active_workspace`, and `mcp_note_access`; missing fields fail visibly. Joined workspaces, plan information, and sign-out links are discovery or connection metadata and do not affect that binding; an added workspace or changed plan metadata alone does not block a later import. Changes to the account, active workspace or access scopes still require review.

## Acquire desktop screenshots

The Granola MCP has no attachment list or image bytes. For a note with an Images stack, observe the current image count in the desktop app. Open each image and use its Download control to save the original into a new, otherwise empty directory. Keep the app-generated `attachment-<uuid>` names. The app may use a `.jpg` filename for PNG bytes; the importer detects the actual format.

After the meeting Markdown is staged in its registered receiving repository, run:

```sh
ki acquire images --adapter granola --repo /path/to/knowledge-base --source <meeting-uuid> --directory /path/to/exports --expected <desktop-image-count> --dry-run
ki acquire images --adapter granola --repo /path/to/knowledge-base --source <meeting-uuid> --directory /path/to/exports --expected <desktop-image-count>
ki acquire reconcile --adapter granola --repo /path/to/knowledge-base
```

The command rejects missing, extra, duplicate, non-image, and conflicting files. It preserves the export bytes beside the meeting Markdown and writes `<meeting-uuid>--attachments.json` with each attachment UUID, SHA-256, and byte count. Repeating the command with the same exports is safe; changed exports require review. The manifest records a user-observed source count, not an MCP-certified inventory. The receiving repository or verified durable destination must retain the original images and manifest before any source retirement.

## Prepare manual retirement

Granola exposes no supported archive or delete operation through its official MCP, so acquisition never deletes meetings. The accepted retirement path is a verified manual-release manifest followed by human deletion in Granola.

Before producing a manifest, run a full-history `--refresh-transcripts` import for every configured receiver, repeat it until every receiver reports all meetings unchanged, run `reconcile`, and commit each receiver's `+/_ACQUIRE/granola/` state. For screenshot-bearing notes, re-export the current desktop Images stack and repeat `ki acquire images` to check count, UUIDs, and bytes against the committed manifest. The release manifest must reconcile one shared account, source schema, interval, and identity checkpoint across the complete receiver union; deduplicate intentional receiver copies; name each meeting UUID and source-version hash; and exclude any meeting with an unavailable detail or transcript projection, unresolved routing conflict, failed checksum, uncommitted receiver document, or unverified current screenshot stack.

Present the exact eligible list to the human operator and stop. The human deletes only that list in Granola. A later complete discovery treats the meetings' source-side absence as the signifier that manual retirement completed while the committed receiver documents and ledgers remain durable evidence. Any Granola or receiver change after manifest generation invalidates the affected list and requires fresh reconciliation.

## Understand staged evidence and recovery

Without `capture_root`, meeting Markdown is staged beneath `+/_ACQUIRE/granola/`. The authoritative `ledger.json` records one completely verified generation, with separate detail and transcript hashes and transcript retry state. The in-progress `journal.json` records the selected identities, verified staged paths and component hashes, failures, retry state, and remaining work.

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
