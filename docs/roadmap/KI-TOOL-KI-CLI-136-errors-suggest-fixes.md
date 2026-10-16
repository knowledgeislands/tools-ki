---
id: KI-TOOL-KI-CLI-136
area: CLI
title: Errors suggest fixes
project: tools-burndown
purpose: corrective
kind: deliver
component: repo
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-15T09:36:28Z
updated_at: 2026-10-16T01:15:23Z
---

# Errors Suggest Fixes

## Goal

`ki` tolerates the ordinary states of a host and tells the user how to put them right. An unbound declared store is reported with the exact `ki repo store bind` command, including the folder when it can be inferred; a macOS privacy denial is reported as a denial with its fix, never read as an empty or missing folder; and every user-facing `ki` error carries a suggested next command.

## Context

Kris Brown, in the mac-studio-bootstrap thread on 15 October 2026 (KI-STORE-TOLERANCE, decision 106 in the thread's decisions log): "as a followup, we need to make the tooling more tolerant of errors like this and if anything they should suggest fixes, not just error".

The errors in question came from bringing a second Mac, `sol`, level with `terra`. The read-only `readonly-checks` run found that all eight principals declared a `sources` store that `sol` had not bound, while `terra` bound each to its `OneDrive-Personal/sources-*` folder. An earlier run, `terra-read`, had reported that `terra` had no `sources-*` folders at all. That was wrong: over SSH, macOS privacy protection let `terra` list `~/Library/CloudStorage/OneDrive-Personal` but refused to open it ("Operation not permitted"), and the search read the refusal as an empty folder. The `registry-bind` run then bound `sol`'s eight stores by hand and recorded the friction below.

What `ki` 0.10.4 does today, observed at `4b99032c`:

- **Unbound stores.** `ki repo store list` renders each store as `` `${store.role}: ${store.state}` `` ([store.ts:128](../../src/commands/repo/store.ts)), so an unbound store reads `sources: unbound` with no next step. Its inventory ([repository-stores.ts:44](../../src/core/storage/repository-stores.ts)) records only `bound` or `unbound` and never checks that a bound path still exists.
- **Commands that need a store.** `registeredKnowledgeBaseStoreRoots` throws `declared <role> store is not bound` ([local-stores.ts:24](../../src/core/storage/local-stores.ts)). `ki repo repair` already warns instead of failing and ends with `run ki repo --repo <root> store list` ([repair.ts:79](../../src/commands/repo/repair.ts)), and `ki repo open` does the same ([open.ts:74](../../src/commands/repo/open.ts)). Both point at `store list`, which itself offers no fix.
- **`ki doctor`.** [doctor.ts](../../src/commands/manage/doctor.ts) has no store check. Before `registry-bind` ran, `sol` had eight unbound declared stores and `ki doctor` reported `healthy`, `warn=0`.
- **The folder is inferable.** `conventionalSourcesStore` already names `OneDrive-Personal/sources-<name>` ([repository-stores.ts:84](../../src/core/storage/repository-stores.ts)), and `ki repo store scan` finds conventional folders that a repository does not declare ([repository-stores.ts:113](../../src/core/storage/repository-stores.ts)). Nothing runs the reverse direction, offering a matching folder for a declared but unbound store.
- **Privacy denials are swallowed.** `repositoryStoreDirectory` catches every `lstat` error ([local-stores.ts:11](../../src/core/storage/local-stores.ts)), so `EPERM` becomes "store must be an existing direct directory". `managedSourcesStore` does the same for the OneDrive root and the store ([repository-stores.ts:175](../../src/core/storage/repository-stores.ts), [:179](../../src/core/storage/repository-stores.ts)). The estate symlink scan reads `~/Library/CloudStorage` and each `OneDrive*` folder with `readdir(...).catch(() => [])` ([host.ts:118](../../src/core/estate/host.ts), [:120](../../src/core/estate/host.ts)), so a denied folder is an empty one. Only the scan's per-folder check passes a non-`ENOENT` error through, as a raw diagnostic with no fix ([repository-stores.ts:145](../../src/core/storage/repository-stores.ts)).
- **Error rendering.** The CLI prints every `KiError` as `ki: error: <message>` and exits ([cli.ts:123](../../src/cli.ts)). `KiError` carries a message and an exit code only ([errors.ts:1](../../src/core/errors.ts)), so a suggested command lives in message text where a command remembered to write one. The [product-engineering standard](../../.agents/skills/ki-self/references/standards-product-engineering.md) has no rule on error guidance.

Friction from the `registry-bind` run report, 15 October 2026:

1. `ki doctor` cannot see unbound stores: eight unbound, verdict `healthy`.
2. `store list` says `unbound` with no next step, and does not offer the `ki repo --repo <checkout> store bind sources <path> --write` command or the matching `OneDrive-Personal/sources-<territory>` folder when one exists.
3. `ki repo store bind --help` and `store list --help` do not mention `--repo`, `--principals` or `--territory`, because those belong to `ki repo`; nothing in the subcommand help shows how to choose the repository.
4. Run from `~/workspaces`, which is not a repository, with no selection, `ki repo store list` printed lines such as `not /Users/krisbrown/workspaces/equal-remedy/apps-dafacts.org` without saying what "not" means or what to do.
5. The preview says `would write registry.toml` without the full path, and after `--write` gives no undo hint (`store unbind sources`).
6. `bind` describes `<absolute-path>` as an "existing direct directory" ([store.ts:248](../../src/commands/repo/store.ts)); "direct" (not a symbolic link) is not explained.
7. Store folders are named after the territory (`sources-sacred-inquiry`), not the repository code (`si`), and neither `.ki.toml` nor `ki` records the expected folder, so matching another machine's bindings meant guessing by name.

## Boundary

- In: a `ki doctor` check that warns on each declared but unbound or unavailable store with the bind command; `store list`, `repair`, `open` and the store-needing commands naming the exact `ki repo --repo <checkout> store bind <role> <path> --write`, with the path filled in when one conventional folder matches and a placeholder otherwise; telling `EPERM` and `EACCES` apart from `ENOENT` wherever `ki` reads a store or the OneDrive root, and reporting a denial as such with its fix (grant Full Disk Access to the terminal or `sshd-keygen-wrapper`, or run at the Mac's screen); a structured suggestion on `KiError` rendered by [cli.ts](../../src/cli.ts) as a `next:` line, adopted across user-facing errors; a matching rule in the product-engineering standard; the help and wording fixes in friction items 3 to 6; contract tests through `run(args, context)`, with denial simulated through injected file-system errors.
- Out: binding anything automatically; Full Disk Access or other privacy changes on a host; syncing or mounting stores; the host-absent marker and distinct store states, which [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md) owns; repair's warning itself, delivered by [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md).

## Current state

Adopted to `next` as a draft on 16 October 2026 and not yet planned; `ki-plan` records the current state before this record becomes Ready.

## Steps

- [ ] Shape this record through `ki-plan`; no delivery step is planned yet.

## Files touched

Not yet determined.

## Verify

Not yet set. The plan names the exact gates; at minimum the repository test suite through `run(args, context)` and the `ki-engineering` audit.

## Dependencies / blocks

Not blocked to plan. It overlaps [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md), which changes the same store states and `store list` output, and builds on the availability helper and warning wording from [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md); planning should settle the order or fold the store-suggestion part into one of them.

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

Capture only, on Kris Brown's explicit request (decision 106), outside the thread's burn-down rule; adoption, priority and plan belong to this repository. Questions for planning: whether a folder hint for friction item 7 belongs in `.ki.toml` (an optional expected store name) or is inferred from the territory handle; whether the general rule is enforced by a test that every `KiError` thrown from a command carries a suggestion, or applied incrementally; and whether the record should split into the store work and the cross-cutting error rule.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.
