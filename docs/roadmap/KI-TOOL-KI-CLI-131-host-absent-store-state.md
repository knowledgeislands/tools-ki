---
id: KI-TOOL-KI-CLI-131
area: CLI
title: Host-absent store state
project: tools-burndown
purpose: corrective
kind: deliver
component: repo
horizon: next
status: draft
blocks: [KI-TOOL-KI-CLI-136]
blocked_by: [KI-TOOL-KI-CLI-126]
baseline_ref: null
created_at: 2026-10-14T20:57:30Z
updated_at: 2026-10-16T01:18:25Z
---

# Host-Absent Store State

## Goal

Every command that touches a Knowledge Base's declared external store treats a host without that store as a supported, honestly reported state. `ki repo open` and the VS Code workspace warn and continue without the store; the machine-local registry can record that a store is deliberately absent on this host, and status and `store list` report bound, absent-by-choice and missing stores distinctly; `ki repo store create` fails clearly where its OneDrive root does not exist.

## Context

[KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md) was captured with this whole boundary. On adoption on 14 October 2026 it was narrowed to the repair defect that keeps ki-principal's CI from reaching its audit, under Kris Brown's decision "adopt KI-TOOL-KI-CLI-126 into Now and plan it, so that ki repo repair reports an unbound store without failing, the audit step runs again, and CI goes red only on real findings". This record keeps the remainder, as observed at `134bc32`:

- `ki repo open` (`src/commands/repo/open.ts`) throws on an unbound or missing store through `registeredKnowledgeBaseStoreRoots` and opens nothing.
- The VS Code workspace builder (`src/core/manage/vscode.ts`) validates a bound `sources` path with `repositoryStoreDirectory` and throws when that directory is absent on the host.
- `ki repo store create` resolves its root to `~/Library/CloudStorage/OneDrive-Personal` (`src/core/storage/repository-stores.ts`), a macOS-only location; `ki repo store bind` accepts any existing absolute directory.
- The registry's `stores` table (`src/core/storage/local-registry.ts`) holds only absolute paths per role, so it cannot say that a store is deliberately absent on this host.

On the Linux agent host vega, ki-principal's `sources` store is bound to an empty, read-only local directory as a stopgap. That binding is misleading once the store has content and should be removed when this lands.

## Boundary

- In: `ki repo open` and the VS Code workspace skipping an unavailable store with a warning; a registry representation for a store deliberately absent on a host, with a command to set and clear it; status and `store list` reporting bound, absent-by-choice and missing stores distinctly; `ki repo store create` failing clearly, not wrongly, where the OneDrive root does not exist; folded from KI-TOOL-KI-CLI-136, each store warning and error naming its exact fix command with the conventional folder filled in when one matches, and a `ki doctor` store check; contract tests through `run(args, context)`.
- Out: `ki repo repair`, which [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md) owns; syncing or mounting stores across hosts; any change to the mirror-note contract; commands that need originals, which keep failing clearly when the store is unavailable; changes on vega itself.

## Current state

Read at `46392f1a` on 16 October 2026.

- **Availability helper.** [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md), released in `v0.10.5` and awaiting acceptance, added `knowledgeBaseStoreAvailability` in `src/core/storage/local-stores.ts`: per declared external role, either the validated root or a reason (`not bound`, or the `repositoryStoreDirectory` message). Only `ki repo repair` uses it, warning `! Store: <role> store is unavailable on this host (<reason>) ... run ki repo --repo <root> store list` and never failing.
- **`ki repo open`.** `src/commands/repo/open.ts:71` still calls the throwing `registeredKnowledgeBaseStoreRoots` and fails the whole open with `Knowledge Base <root> has an unavailable declared store ...; run ki repo --repo <root> store list`.
- **VS Code workspace.** `src/core/manage/vscode.ts:85` and `:213` call `repositoryStoreDirectory` on a bound `sources` path and throw when it is absent; an unbound store is skipped silently.
- **Registry.** `src/core/storage/local-registry.ts` accepts only `repository`, `path`, `stores` and `search_boundary` per entry, and `stores` only absolute `sources` and `legacy` paths. The registry is already per host, so a host marker belongs in it.
- **`store list`.** `repositoryStoreInventory` (`src/core/storage/repository-stores.ts:31`) gives `bound` or `unbound` and never checks that a bound path exists; text rendering at `src/commands/repo/store.ts:128` prints `<role>: <state> [path]` with no next step. The JSON form `ki/repository-stores/v1` is read by the Observatory (`apps-observatory.local/packages/contracts/src/repository-stores.ts`), which accepts `state` only as `bound` or `unbound` and ignores extra fields.
- **`store create`.** `managedSourcesStore` (`repository-stores.ts:172`) fails `OneDrive source-store root is unavailable: <root>` on any host without `~/Library/CloudStorage/OneDrive-Personal`, which is accurate but offers no route.
- **`ki doctor`.** `src/core/manage/doctor.ts` has statuses `pass`, `fail` and `skip` only, and the command prints a hard-coded `warn=0`; it has no store check.

## Decision

1. **Marker.** A registry entry gains `absent_stores = ["<role>", ...]`, a sibling of `stores`, listing roles deliberately absent on this host. A role may not be both bound and absent; the registry validator rejects it. Keeping `stores` as paths only leaves every existing reader of it unchanged.
2. **Unbound without a marker** keeps warning, as repair does since KI-TOOL-KI-CLI-126, and never fails: failing would undo KI-TOOL-KI-CLI-126's CI outcome. The accidental omission stays visible as a warning in repair, open, `store list` and doctor; a role marked absent is reported once as information and draws no warning.
3. **`store create`** gains no non-macOS default. Where the OneDrive root is missing it refuses with the two routes: `ki repo --repo <root> store bind <role> <path> --write` or `ki repo --repo <root> store absent <role> --write`.
4. **Fold from [KI-TOOL-KI-CLI-136](KI-TOOL-KI-CLI-136-errors-suggest-fixes.md).** The store-reporting part of KI-TOOL-KI-CLI-136 moves here, because it rewrites the same messages and `store list` output: every store warning and error names the exact fix command, with the path filled in when exactly one conventional `sources-<name>` folder matches the repository (the names `store scan` already uses), and `ki doctor` gains a store check. KI-TOOL-KI-CLI-136 keeps the denial handling, the structured `next:` suggestion on `KiError`, the product-engineering rule and the help wording.
5. **States.** `store list` keeps `state: bound | unbound` in `ki/repository-stores/v1` and adds an `availability` field: `available` or `unavailable` (with `reason`) for a bound store, `absent` or `missing` for an unbound one. The text form prints the availability and, for `unavailable` and `missing`, the fix command. The Observatory keeps parsing; adopting the new field is its own choice.

## Steps

- [ ] Registry: add `absent_stores` to `LocalRegistryEntry`, its validator (array of declared external role names, no duplicates, no role also in `stores`) and its TOML writer in `src/core/storage/local-registry.ts`.
- [ ] Core: extend `knowledgeBaseStoreAvailability` to return `absent` for a marked role, and add a pure `storeFix(root, role, candidates)` in `src/core/storage/repository-stores.ts` that names the bind command, filling the path when exactly one conventional folder exists, else `<absolute-path>`, and the `store absent` alternative.
- [ ] Core: `repositoryStoreInventory` gains `availability` and `reason`, checking bound paths with `repositoryStoreDirectory`; export through `src/core/storage/index.ts`.
- [ ] Command: add `ki repo store absent <role> [--clear] [--write]` in `src/commands/repo/store.ts`, previewing without `--write`, refusing a bound role ("unbind it first") and `notes`; `store unbind` leaves the marker alone.
- [ ] Command: `store list` text and JSON per Decision 5; `store create` refusal per Decision 3.
- [ ] `ki repo open`: use the availability helper; skip unavailable, missing and absent stores, print one warning per unavailable or missing store with its fix, and open the rest.
- [ ] VS Code workspace (`src/core/manage/vscode.ts`): skip an unavailable bound `sources` folder with a warning returned to the caller instead of throwing, in both the trust map and the workspace folders.
- [ ] `ki repo repair`: replace the `store list` hint with the fix from `storeFix`; report an absent role as `Store: <role> store is absent on this host by choice` without a warning.
- [ ] `ki doctor`: add `warn` to `ManageCheckStatus`, count it in the summary line in place of the hard-coded `warn=0`, and add a registered-repositories store check that warns once per unavailable or missing store with its fix and passes when every declared store is available or absent. A warning never changes the exit code.
- [ ] Contract tests through `run(args, context)` and `sandbox()` (see Verify).
- [ ] Documentation: `README.md` store section, `man/ki.1` and regenerated `man/ki.commands.json`, `docs/guides/user/repository-operations.md` and `vscode-management.md`, and `CHANGELOG.md`.

## Files touched

- `src/core/storage/local-registry.ts`, `local-stores.ts`, `repository-stores.ts`, `index.ts`
- `src/commands/repo/store.ts`, `open.ts`, `repair.ts`
- `src/core/manage/vscode.ts`, `src/core/manage/doctor.ts`, `src/commands/manage/doctor.ts`
- `src/tests/cli/repo/store.test.ts`, `open.test.ts`, `repair.test.ts`, `src/tests/cli/manage/doctor.test.ts`, and the VS Code workspace test
- `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/repository-operations.md`, `vscode-management.md`, `CHANGELOG.md`

## Verify

1. Registry: an entry with `absent_stores = ["sources"]` round-trips; one with `sources` both bound and absent is reported invalid; an unknown role is rejected.
2. `store absent sources` previews, writes with `--write`, refuses a bound role and `notes`, and `--clear --write` removes it.
3. `store list --format json` keeps `schema: ki/repository-stores/v1` and `state` as before, with `availability` `available`, `unavailable` (bound path deleted), `absent` and `missing`; the text form prints the fix for the last two, with the path filled from a single matching `sources-<name>` folder in the sandbox home and the placeholder when there are none or two.
4. `ki repo open` against two Knowledge Bases, one with a missing store and one with an absent store, opens both, warns once for the missing store with its fix and not for the absent one.
5. The VS Code workspace is written without the unavailable `sources` folder and with a warning, instead of failing.
6. `ki repo repair` warns with the fix command for a missing store, reports an absent store without a warning, and still exits 0; the KI-TOOL-KI-CLI-126 CI-replay test passes unchanged.
7. `store create` with no OneDrive root in the sandbox home fails naming both routes.
8. `ki doctor` with eight unbound declared stores reports eight warnings and `warn=8`, still exits 0; with every store bound or absent it reports pass.
9. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .` and `bunx knip` clean; `ki repo audit --repo .` and rumdl pass.
10. A contract test asserts that every store object in the JSON output still carries `role`, `state` and, exactly when bound, `path`, the fields the Observatory's `ki/repository-stores/v1` parser requires.

## Dependencies / blocks

- Blocked by [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md) until Kris accepts it: this record reuses its helper and warning, which are already on `main` and in `v0.10.5`, so delivery can start the moment it is accepted.
- Blocks [KI-TOOL-KI-CLI-136](KI-TOOL-KI-CLI-136-errors-suggest-fixes.md), which converts the fix strings this record introduces into structured suggestions.
- Removing vega's stopgap `sources` binding waits for this record and belongs to the agent-host Project, not here.

## Documentation impact

### Decision Records

None; the registry is a `tools-ki`-owned machine-local file.

### Specifications

None. `ki/repository-stores/v1` gains an additive field and keeps its existing fields and values.

### Guides

`README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/repository-operations.md`, `vscode-management.md` and `CHANGELOG.md`: the `absent` subcommand, the availability states, open's and doctor's new behaviour.

### Roadmap

KI-TOOL-KI-CLI-136's boundary narrows by Decision 4.

## Discussion

Captured as triage when KI-TOOL-KI-CLI-126 was narrowed; adoption, horizon and plan belong to this repository's queue.

Open design points for planning:

- Whether the absence marker belongs in the existing `stores` table, for example a reserved value per role, or in a separate per-host table.
- Whether, once a marker exists, an unbound store with no marker should go on warning as KI-TOOL-KI-CLI-126 makes repair do, or fail until the host says the store is absent, so that an accidental omission stays visible.
- Whether `ki repo store create` should learn a non-macOS default or only refuse clearly and point to `store bind`.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned on 16 October 2026 and left in draft only because KI-TOOL-KI-CLI-126 is not yet accepted: the roadmap audit (ITEM-5) refuses an active record with a non-done blocker. Once Kris accepts KI-TOOL-KI-CLI-126, set this record Ready unchanged.
