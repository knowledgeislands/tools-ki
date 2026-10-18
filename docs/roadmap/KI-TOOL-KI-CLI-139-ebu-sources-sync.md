---
id: KI-TOOL-KI-CLI-139
area: CLI
title: EBU sources sync
project: knowledge-acquisition
purpose: capability
kind: deliver
component: acquire
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-15T23:15:13Z
updated_at: 2026-10-16T01:15:23Z
---

# EBU Sources Sync

## Goal

`ki` can keep a repository's copy of the EBU 5G-EMERGE SharePoint documents it uses in step with SharePoint, from sources that repository declares in tracked configuration, and can tell the other copies on the same machine when they hold an older version. `hnr-principal` is the first user: it has no toolchain of its own, so its recorded copy in the `sources-humans-not-robots` store is synchronised by `ki`.

## Context

The owner, Kris Brown, answered the sources-model queries on 16 October 2026 ([Decision 55](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/5g-emerge-phase3/decisions.md#decision-55-2026-10-15t231214z) in the `5g-emerge-phase3` thread; queries in the [sources-model report](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/5g-emerge-phase3/sources-model.report.md)). Under that model `hnr-principal`, `5g-emerge-phase2` and `5g-emerge-phase3` each keep an independent copy of the SharePoint documents they use; only `hnr-principal`'s copy is the recorded, fully linked one. SRC-TOOLING placed `hnr-principal`'s sync and the shared status format in `tools-ki`, with `hnr-principal` declaring its sources in tracked configuration. On the same day the owner settled where the declaration lives and the store layout ([Decision 58](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/5g-emerge-phase3/decisions.md#decision-58-2026-10-16t004809z)): SRC-DECLARATION puts the source list in the front matter of `hnr-principal`'s KB Specifics note, with `.ki.toml` only pointing to it, and SRC-PATH-NAMES fixes the store's top-level folder as `5g-emerge`. The owning record there is [HNR-PRINCIPAL-5GE-005](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/Streams/Roadmap/HNR-PRINCIPAL-5GE-005-keep-ebu-sources-aligned.md).

Both sites already acquire with Bun scripts that read the owner's Chrome `FedAuth` and `rtFa` cookies for `ebu1.sharepoint.com`, exit `40` on a lapsed session and identify a version by path or name, byte size and SharePoint modified time. Phase 2 tracks five documents in Strand 1; Phase 3 mirrors the whole `/sites/5g-emerge_phase2/Phase 3/Phase 3 - Working Docs` folder into a manifest (`.source-manifest.json`, schema 1). Neither script is reused here: SRC-TOOLING rejected running the Phase 3 script for `hnr-principal` because it would tie that copy to Phase 3 code.

## Boundary

In:

- **Tracked per-repository source configuration (SRC-DECLARATION).** `ki` reads a repository's source list from the front matter of its KB Specifics note (for `hnr-principal`, `Admin/Knowledge Management/KB Specifics/EBU SharePoint Sources.md`), located through a `.ki.toml` entry that only points to the note and repeats no source, so the note is the single source. The front matter carries the SharePoint host and site, each source as a folder to mirror or a single document (by path or document identifier), the store-relative root, and the short segment names that make up its fully qualified store path.
- **Path layout (SRC-PATH-NAMES).** For `hnr-principal` the store's top-level folder is `5g-emerge`, standing for the site `/sites/5g-emerge_phase2`, and every document sits below it at its full SharePoint path, whichever subset Phase 2 or Phase 3 holds. A level with a programme short form takes it, as in `5g-emerge/S1/WP1.2/TVR/<document>`; Phase 3 documents sit under `5g-emerge/P3/Working Docs/`. Subfolders below a shortened level and all file names keep their SharePoint names.
- **Version rule (SRC-VERSION).** A version is newer when its SharePoint modified time is later; byte size and the SharePoint unique identifier break ties, and the ETag or version label is recorded where the listing returns it. The unique identifier also keeps a move or rename from reading as a new document.
- **Per-copy version record.** Beside the files, one record per document: server-relative path, unique identifier, modified time, size, ETag, whether the body is held, skipped by policy or removed upstream, and when it was last checked and last downloaded.
- **Inform-only status (SRC-INFORM, SRC-STATUS-HOME).** After a successful check or sync, `ki` writes the repository's status file to `$XDG_STATE_HOME/ki/ebu-sources/<repository>.json` (owner-only), reads its siblings' files, and reports every shared document a sibling holds at an older version. It never writes into another repository's copy, cache or status file; the sibling's own next check, session or unattended run fetches from SharePoint. The status shape is the shared contract Phase 2 and Phase 3 publish too.
- **Authentication (SRC-AUTH).** Read the Chrome cookies the same way the sites do, with `ki`'s own owner-only session cache, leaving the sites' sessions untouched; a lapsed session fails clearly without prompting.
- **Retention (SRC-RETENTION).** Video is excluded by default but listed in the version record as skipped; files removed upstream are kept and marked removed, never deleted.
- Contract tests through `run(args, context)` and the `sandbox()` helper with an injected SharePoint client; no test contacts the network.

Out:

- changing `5g-emerge-phase2` or `5g-emerge-phase3`; each publishes the status shape through its own record;
- refreshing another copy, merging copies, or making a repository read another's copy as its source;
- any change to the Chrome-cookie authentication model, or moving or sharing credentials and session state;
- binding the sources store or writing `hnr-principal`'s KB Specifics index note (`EBU SharePoint Sources.md`), which `HNR-PRINCIPAL-5GE-005` owns;
- unattended scheduling, which needs its own approval; and
- keeping copies on different machines aligned beyond what OneDrive does for the store.

## Current state

Adopted to `next` as a draft on 16 October 2026 and not yet planned; `ki-plan` records the current state before this record becomes Ready.

## Steps

- [ ] Shape this record through `ki-plan`; no delivery step is planned yet.

## Files touched

Not yet determined.

## Verify

Not yet set. The plan names the exact gates; at minimum the repository test suite through `run(args, context)` and the `ki-engineering` audit.

## Dependencies / blocks

Not blocked; blocks nothing in this repository. [HNR-PRINCIPAL-5GE-005](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/Streams/Roadmap/HNR-PRINCIPAL-5GE-005-keep-ebu-sources-aligned.md) depends on this record for `hnr-principal`'s sync. The Phase 2 and Phase 3 records the owner asked for (SRC-MATCHING) consume the status shape defined here.

## Documentation impact

### Decision Records

Not yet assessed.

### Specifications

Not yet assessed.

### Guides

Not yet assessed.

### Roadmap

None.

## Discussion

Origin: SRC-TOOLING in Decision 55, captured at triage by the `sources-decisions` run on 16 October 2026. Capture only; adoption, priority and plan belong to this repository.

Planning has to settle where the command sits. [ADR-KI-TOOL-KI-004](../decisions/ADR-KI-TOOL-KI-004-acquisition-command-boundary.md) keeps acquisition inside `ki`, and the [acquisition specification](../specs/acquisition.md) discovers adapters from Harness skill metadata (ACQUIRE-010). A SharePoint mirror that refreshes a store copy in place is not a Knowledge Exchange Package import, so it may be a new `ki acquire` adapter with a matching Harness skill or a separate command group; either way a specification change comes first. The `.ki.toml` pointer key, the front-matter keys, the status file's schema version and whether the shape is published in KI Specifications are planning questions too.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the knowledge-acquisition Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.
