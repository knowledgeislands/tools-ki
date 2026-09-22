---
id: KI-TOOL-CLI-078
title: Consolidate audience-centric guides
area: CLI
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: null
created_at: 2026-09-21T15:44:00Z
updated_at: 2026-09-22T06:55:00Z
---

## Goal

The guide collection is complete and stable enough that another repository can cite individual guides at a pinned tag without the path moving underneath it.

## Context

`tools-ki` already splits `docs/guides/` into `user/` and `developer/`, so the structure is right. What this item asks is whether the collection is complete, and whether its paths are now stable.

The layout has moved recently, and it broke a downstream citation. At `v0.4.0` the user guides sat flat at `docs/guides/<name>.md`; they are now under `docs/guides/user/`. KI Website links several of them at `v0.4.0`, and those pinned links still resolve — but its provenance sweep reports that `docs/guides/vscode-management.md` no longer exists on the default branch, because it moved rather than changed. A move is indistinguishable from a deletion to anything reading the old path.

KI Website now declares, for every page it publishes under `apps/site/src/guidance/`, the exact upstream document and pinned ref that page was written from, and a `verify:guidance --network` sweep reports the pages whose source has moved. The site intends to derive public guidance for this project from this repository's own guides and cite them at a pinned ref, so the quality and stability of `docs/guides/` here directly determines the quality of what the site can publish.

That is a pull, not an obligation: KI Website derives, it does not own. This repository decides what its guides say and when they change.

Separately, `ki-guides` is being asked to require audience directories under `docs/guides/` rather than permitting a flat collection (`ki-agentic-harness` `KI-HARNESS-GOV-083`). If that lands, this repository's collection has to satisfy it.

## Boundary

Adopted into `Now` by explicit approval, so this is prioritised work rather than intake. `ki-plan` has shaped it to `Ready`; this repository still owns its plan and sequencing.

KI Website derives and cites; it does not own this collection. A guide that would not serve this repository's own readers should not be written for the site's benefit.

Two things this item explicitly does not do. It does not hand-write a command inventory into a guide: the complete list of groups, invocations, and descriptions is `KI-TOOL-CLI-080`'s to publish from something this CLI states and tests, and a second hand-maintained copy would drift exactly as the manual's two inventories already have. And it does not reclassify `docs/specs/`: that corpus is numbered RFC-2119 behaviour with named verification tests, which is a specification and not a displaced guide.

## Shaping

The sweep found one structural defect rather than a scatter of small ones. This repository's README defers four practical topics to `https://knowledgeislands.info/guidance/cli/…` — the ChatGPT local-capture format, the capability lifecycle, update and upgrade, and the local utility commands. Those are procedures for operating this executable, deferred to a site that derives from this repository, so the material a reader needs exists only downstream of the repository that owns the behaviour. The URLs are also now stale: KI Website moved `/guidance/cli/<page>/` to `/projects/ki/<page>/` and serves the old paths as 301 redirects.

The consequence for a first-time reader is sharper than a broken link. `docs/guides/user/` holds six narrow, advanced workflows — Agora references, batch records, Granola acquisition, repository-local governance, standing knowledge intake, VS Code projections — and nothing that gets a reader from nothing installed to a working `ki`. Installation lives only in the README; `ki bootstrap` is described only in the manual page; `ki skill`, `ki repo skill`, `ki manage list`, `ki manage missing`, `ki repo open`, and `ki repo educate` appear in neither the README nor any guide. The most-used surface of the whole CLI, `ki repo audit` and `ki repo conform` with its target-selection rules, has no guide at all.

So consolidation here means writing the four missing routes as repository-owned guides and then reducing the README sections they replace to purpose, smallest credible example, and a pointer — rather than leaving the README as a parallel tutorial. The guides carry sequence, conditions, verification, and recovery; exact grammar stays with `ki --help` and `man/ki.1`.

On authority: `man/ki.1` and `ki --help` are authoritative for command grammar — the exact invocation, option names, and arguments. A guide is authoritative for the procedure: order, preconditions, what to check, and how to recover. Where they appear to disagree about grammar the manual wins and the guide is corrected; where a guide and a specification disagree about behaviour the specification wins. A guide therefore does not restate a flag list, which is also what keeps it from drifting.

On path stability: the flat-to-`user/` move does warrant a changelog note. A downstream repository pinning `docs/guides/<name>.md` has no other signal that the document moved rather than was deleted, and this repository's changelog is the only place it can learn it.

## Current state

`docs/guides/` splits `user/` and `developer/`, each with its own index, and `.ki.toml` declares `[skills.ki-guides]`. `ki repo audit --skill ki-guides` passes mechanically: the root, entry point, and single H1s are all present, and there is no retired `docs/spec/` or `docs/developer/` sibling. What fails the judgment criterion `ROUTE-2` is routing and completeness.

| Symptom | Evidence |
| --- | --- |
| Practical material outside the collection | Four README deferrals to `knowledgeislands.info/guidance/cli/…`, all now 301 redirects to `/projects/ki/…` |
| No first-time route | `docs/guides/user/README.md` lists six advanced workflows; installation and `ki bootstrap` appear nowhere in the collection |
| Core surface undocumented | No guide covers `ki repo audit`, `ki repo conform`, or `--repo` / `--agora` / `--estate` target selection |
| Unstable citation | User guides moved from `docs/guides/<name>.md` to `docs/guides/user/<name>.md` after `v0.4.0` with no changelog note |

`man/ki.1` is hand-maintained and carries user-facing instruction the collection does not, but it is a manual page rather than a displaced guide; the gate is `bun run ki:tools:lint-man`.

## Steps

- [ ] Add `docs/guides/user/getting-started.md`: install from a pinned release, run `ki bootstrap`, register the first repository, and verify with `ki manage diag` and `ki repo diag`.
- [ ] Add `docs/guides/user/capability-lifecycle.md`: the installation-versus-activation boundary, harness prefix ownership, private GitHub harness archives under `auth = "github-cli"`, and `ki skill` / `ki repo skill` activation in each scope.
- [ ] Add `docs/guides/user/repository-operations.md`: target selection by `--repo`, `--agora`, and `--estate`, the registry, and running `ki repo audit`, `conform`, `educate`, and `repair` including the conform publication boundary.
- [ ] Add `docs/guides/user/local-installation.md`: keeping the installation current and healthy with `ki manage update`, `outdated`, `completion`, `list`, `missing`, `search`, `docs`, `diag`, `doctor`, `repair`, and `cleanup`, plus `ki repo upgrade`.
- [ ] Rewrite `docs/guides/user/README.md` so it opens with a start-here route and then groups the collection by what the reader is doing, not by filename order.
- [ ] Rewrite `docs/guides/README.md` so it routes by audience before anything else and states the grammar-versus-procedure authority boundary once, for both audiences.
- [ ] Replace the four `knowledgeislands.info/guidance/cli/…` deferrals in `README.md` with the in-repo guides, and reduce each affected section to purpose, smallest credible example, and pointer.
- [ ] Record the flat-to-`user/` guide path move in `CHANGELOG.md` under the in-progress release, so a downstream repository pinning the old path can learn it moved.
- [ ] Run `ki repo audit --skill ki-guides`, `--skill ki-authoring`, and the full repository audit, and repair what they report.

## Files touched

`docs/guides/README.md`; `docs/guides/user/README.md`; four new guides under `docs/guides/user/`; `README.md`; `CHANGELOG.md`; this record.

No source, test, or configuration file changes, so the `bun run test:coverage`, `biome`, and `knip` gates are unaffected. `bun run ki:tools:lint-man` is run as evidence that `man/ki.1` is untouched and still lints.

## Verify

`ki repo audit --skill ki-guides --repo .` passes, `ki repo audit --skill ki-authoring --repo .` passes over the collection, and the full `ki repo audit --repo .` passes. `bun run ki:tools:lint-man` passes. No `knowledgeislands.info/guidance/cli/` link remains in `README.md`.

## Dependencies / blocks

Nothing blocks this. `KI-HARNESS-GOV-083` in `ki-agentic-harness` proposes making audience directories a `ki-guides` requirement; this collection already groups by audience, so that change should confirm the arrangement rather than force one.

`KI-TOOL-CLI-080` owns the machine-readable command inventory. This item defers every exhaustive command listing to it and to `man/ki.1`, and adds no second hand-maintained inventory that would need reconciling later.

## Documentation impact

### Decision Records

No decision record is needed. This is consolidation within an arrangement the repository has already adopted.

### Specifications

No behaviour-level contract changes. `docs/specs/` is inspected and deliberately left alone: its requirements are numbered, RFC-2119, and verified by named tests, which makes them behaviour specification rather than displaced guides. Where a guide and a specification disagree, the specification is authoritative and the guide is corrected.

### Guides

This item is entirely guide impact: four missing reader routes are written, the README's deferrals to a downstream site are brought in-house, and both indexes are made to route.

### Roadmap

No further roadmap change is expected. The sweep found no behaviour documented nowhere; it found behaviour documented only downstream, which this item fixes in place.

## Discussion

Shaping settled how far consolidation goes. It goes as far as the four deferred topics and the first-time route, and stops short of the command inventory, which is `KI-TOOL-CLI-080`'s, and short of `docs/specs/`, which is not guide material. The test applied throughout is whether a reader can find the guide, complete its outcome without hidden context, verify success, and recover — not whether every command has a paragraph somewhere.
