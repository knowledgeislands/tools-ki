# Acquire Granola meetings

Use `ki acquire granola import` to take a complete, read-only observation of Granola meetings selected for one registered Knowledge Islands repository. The command writes verified immutable Knowledge Export Packages (KEPs) to that repository's Harbour; it does not harvest their knowledge or change Granola.

## Prepare the source connection

The command uses the locally installed `mcporter` executable and a configured server named `granola`. Authenticate that connection separately before acquisition:

```bash
mcporter auth granola
```

Acquisition passes `--no-oauth` to every call. An expired or absent credential therefore fails visibly instead of opening a browser during an import. Granola remains the credential owner; no OAuth token enters repository configuration, a KEP, or the ledger.

## Declare receiver selectors

Every eligible receiver is a repository registered with `ki` that declares `ki-housekeeping-granola`. Select stable folder IDs rather than folder names:

```toml
[skills.ki-housekeeping-granola]
folder_ids = ["stable-granola-folder-id"]
unfoldered = true
residual = true
```

- `folder_ids` selects meetings returned by those folders.
- `unfoldered = true` accepts meetings inferred from the complete global set minus every complete folder set.
- `residual = true` accepts meetings whose folders have no configured receiver.

At least one selector is required. Only one receiver should normally select a folder. Where deliberate duplication is required, every receiver selecting that folder must name its ID in `duplicate_folder_ids`:

```toml
duplicate_folder_ids = ["stable-granola-folder-id"]
```

The command reads selectors from all locally registered eligible repositories to prove coverage, but it writes only the explicitly selected receiver. Missing coverage, conflicting receivers, an unavailable configured folder, or a folder result absent from global discovery stops before publication.

## Run an acquisition

From the receiving repository:

```bash
ki acquire granola import
```

The default interval is `1970-01-01` through the current UTC date, providing a conservative complete-history start. Set explicit inclusive bounds when required:

```bash
ki acquire granola import --since 2023-01-01 --until 2026-09-09
```

Select another registered receiver without changing directory:

```bash
ki acquire granola import --repo /path/to/repository --since 2023-01-01
```

Use `--dry-run` to perform source reads, completeness checks, routing, content hashing, and existing-package verification without writing repository files.

## Understand completeness and output

Each run lists the global population and every live folder across the interval. A 100-result response is treated as saturated and split into smaller overlapping date windows. A saturated single-day window fails because completeness cannot be proven.

The initial implementation deliberately performs exhaustive content revalidation on every run: each selected meeting's detail and transcript projections are read again. This costs more source calls than a recent-only pass but makes amendment detection trustworthy while Granola exposes no update timestamp, ETag, content version, or deletion tombstone.

New or changed meeting versions are staged beneath:

```text
+/_ACQUIRE/granola/<payload-sha256>/
```

The receiver-local `+/_ACQUIRE/granola/ledger.json` records source and schema hashes, complete identity-window evidence, selected meeting versions, and the last changed checkpoint. An unchanged repeat creates no package and leaves the ledger byte-identical. A changed detail, transcript, listing, or folder-evidence projection creates a new version without rewriting the previous package.

Every package preserves canonical source projections and names unavailable fields in `kep.toml` omissions. An unavailable transcript is an explicit omission, never replaced with a summary.

## Recover safely

The command publishes each package atomically, verifies its checksum manifest, and updates the ledger last. If an import stops between those steps, rerun the same command: verified packages are reused and the ledger advances only after the complete run succeeds.

A missing, malformed, or checksum-invalid package already referenced by the ledger stops acquisition. Restore the committed Harbour evidence rather than deleting or regenerating it silently. A different connected Granola account also stops before source identities can be mixed.

Acquisition success is not permission to archive or delete a Granola meeting. Harvesting, cross-repository knowledge trades, and any eventual source retirement remain separate governed decisions. The as-built guarantees are recorded in the [acquisition specification](../specs/acquisition.md).
