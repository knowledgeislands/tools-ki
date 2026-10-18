---
id: KI-TOOL-KI-CLI-136
area: CLI
title: Errors suggest fixes
project: tools-burndown
purpose: corrective
kind: deliver
component: repo
horizon: next
status: ready
blocks: []
blocked_by: [KI-TOOL-KI-CLI-131]
baseline_ref: null
created_at: 2026-10-15T09:36:28Z
updated_at: 2026-10-18T08:27:27Z
---

# Errors Suggest Fixes

## Goal

`ki` tolerates the ordinary states of a host and tells the user how to put them right. An unbound declared store is reported with the exact `ki repo store bind` command, including the folder when it can be inferred; a macOS privacy denial is reported as a denial with its fix, never read as an empty or missing folder; and user-facing `ki` errors carry a structured suggested next command, starting with the store, registry and repository-selection errors and adopted by others as they are touched.

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

- In: telling `EPERM` and `EACCES` apart from `ENOENT` wherever `ki` reads a store, the OneDrive root or the estate symlink roots, and reporting a denial as such with its fix (grant Full Disk Access to the terminal or `sshd-keygen-wrapper`, or run at the Mac's screen); a structured suggestion on `KiError` rendered by [cli.ts](../../src/cli.ts) as a `next:` line, adopted on the store, registry and repository-selection errors; a matching rule in the product-engineering standard; the help and wording fixes in friction items 3 to 6; contract tests through `run(args, context)`, with denial simulated through injected file-system errors.
- Out: the store fix commands, folder inference and `ki doctor` store check, folded into [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md); a retrofit of every `KiError`; a `.ki.toml` folder hint; binding anything automatically; Full Disk Access or other privacy changes on a host; syncing or mounting stores; the host-absent marker and distinct store states, which [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md) owns; repair's warning itself, delivered by [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md).

## Current state

Re-read at `246e5ead` on 18 October 2026, after [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md) was accepted. The Context above was observed at `4b99032c`; since then:

- **Store reporting is delivered.** KI-TOOL-KI-CLI-131 gave `store list` the `available`, `unavailable`, `absent` and `missing` states with a `fix:` line, made `open`, `vscode sync` and `repair` warn and carry on with the fix, added the `ki doctor` store check and the `store absent` command, and built every fix in `storeFix` (`src/core/storage/repository-stores.ts:76`). Friction items 1 and 2 are closed.
- **Fix text in thrown errors.** Two remain: `managedSourcesStore` appends `; fix: <routes>` to `OneDrive source-store root is unavailable` (`repository-stores.ts:251`), and `store absent` on a bound role ends `unbind it first: ki repo --repo <root> store unbind <role> --write` (`src/commands/repo/store.ts:333`). Every other fix is in a warning or a doctor detail, which are not `KiError`s.
- **Denials are still swallowed.** `repositoryStoreDirectory` (`src/core/storage/local-stores.ts:9`), `managedSourcesStore` (`repository-stores.ts:247`), `conventionalStoreCandidates` (`repository-stores.ts:85`) and the estate symlink roots (`src/core/estate/host.ts:114`) catch every error; `inspectSourcesStore` passes a non-`ENOENT` error through as a raw diagnostic. `symlinkChanges` feeds `planConvergence` (`src/core/estate/plan.ts:199`), which has no diagnostics channel.
- **Errors.** `KiError` (`src/core/errors.ts`) carries a message and exit code; `run` (`src/cli.ts:123`) prints `ki: error: <message>`. The registry-invalid message is built at eight sites (`local-registry.ts` three times, `operations/local-state.ts` twice, `registry/add.ts`, `manage/list.ts`, `repo/store.ts`, `repo/open.ts`).
- **Friction 4 has changed shape.** From `~/workspaces`, `ki repo store list` now selects the mGit workspace members and stops at the first without store roles: `ki: error: repository does not declare Knowledge Base store roles: <path>`, with no next step.
- **Friction 5 is half done.** The preview already names the registry's absolute path (`would write <state>/registry.toml`); `bind --write` still gives no undo hint.
- **Friction 3 and 6** hold as described: no subcommand help mentions repository selection, and `bind`'s `<absolute-path>` reads "existing direct directory".
- The `platform` on `KiContext` is injected, so the denial fix can be worded for macOS and for other hosts in tests.

## Decision

1. **Split with KI-TOOL-KI-CLI-131.** KI-TOOL-KI-CLI-131 delivered the store fix commands in `store list`, `repair`, `open` and the VS Code workspace, the conventional-folder path inference and the `ki doctor` store check. This record delivers what is left: privacy-denial reporting, the structured suggestion on `KiError`, its adoption on the store, registry and repository-selection errors, the product-engineering rule, and friction items 3 to 6.
2. **Incremental rule, not a blanket test.** The product-engineering standard gains the rule that a user-facing error names its next step where one exists, through the structured field. This record applies it to the error families named in Steps; a contract test pins those families. Other errors adopt the field when next touched.
3. **No `.ki.toml` folder hint (friction item 7).** The expected folder is inferred from the names `store scan` already derives, as KI-TOOL-KI-CLI-131 does. Revisit only if inference proves wrong in the field.
4. **Not split further.** The remainder is one coherent change to error presentation.
5. **A denial is never empty.** `EPERM` and `EACCES` read as `access denied`; on macOS the fix names Full Disk Access for the terminal app, or `sshd-keygen-wrapper` over SSH, or running at the Mac's screen, and elsewhere the folder's permissions. A bound store that is denied is `unavailable` with that reason, so warnings and `store list` carry it unchanged. A denied OneDrive root refuses `store create` with the denial; a denied candidate folder is not offered as a fix. The estate symlink scan refuses the converge plan with the denial rather than planning without the folder, since it cannot tell whether a move breaks a link it cannot see; this matches the selection rule that an operation never reports success over what it did not read.
6. **Friction 4 keeps the error.** A selected repository without store roles still fails `store list`, now with `next:` naming `ki repo --repo <knowledge-base-checkout> store list`. Skipping such repositories in a multi-repository listing would change the command's selection contract, which is outside this record.

## Steps

- [ ] `src/core/errors.ts`: `KiError` gains an optional `next` (third constructor argument, exit code unchanged); `src/cli.ts` prints `next: <step>` on its own line after `ki: error:` when present.
- [ ] Denials: an `accessDenial(error, platform)` helper in `src/core/storage/local-stores.ts` that classifies `EPERM` and `EACCES` and words the fix; used by `repositoryStoreDirectory`, `managedSourcesStore`, `conventionalStoreCandidates`, `inspectSourcesStore` and the estate symlink roots. Callers pass the injected platform.
- [ ] Convert the two thrown fix strings (`managedSourcesStore`, bound `store absent`) to `next:`.
- [ ] One `invalidRegistryError(errors, stateDirectory)` in `src/core/storage/local-registry.ts`, with `next:` naming the registry file and `ki registry list`, used by the eight sites; the string-returning `local-state.ts:23` keeps its message text.
- [ ] Selection errors: `no KI repository found from the current working directory`, `repository selection matched no repositories`, `ki repo store mutation requires exactly one repository`, and the store-roles error (friction 4) carry `next:`.
- [ ] Friction 3: each `ki repo store <sub> --help` ends with a line that repository selection (`--repo`, `--territory`, `--principals`) is given to `ki repo`, with the example `ki repo --repo <checkout> store list`.
- [ ] Friction 5: `bind --write` ends with the undo command `ki repo --repo <root> store unbind <role> --write`.
- [ ] Friction 6: the `<absolute-path>` help reads "an existing directory, not a symbolic link".
- [ ] Add the error-guidance rule to `.agents/skills/ki-self/references/standards-product-engineering.md`.
- [ ] Contract tests (see Verify); `man/ki.1`, `man/ki.commands.json`, `README.md`, `docs/guides/user/repository-operations.md` and `CHANGELOG.md`.

## Files touched

- `src/core/errors.ts`, `src/cli.ts`
- `src/core/storage/local-stores.ts`, `repository-stores.ts`, `local-registry.ts`; `src/core/territory/naming.ts`; `src/core/estate/host.ts`; `src/core/repository/selection.ts`, `operations/local-state.ts`
- `src/commands/repo/store.ts`, `open.ts`, `repair.ts`; `src/commands/registry/add.ts`; `src/commands/manage/list.ts`, `doctor.ts`, `vscode.ts` and `src/core/manage/doctor.ts`, `vscode.ts` where they pass the platform
- `src/tests/cli/` tests for store, store scan, registry, selection, rendering and estate converge
- `.agents/skills/ki-self/references/standards-product-engineering.md`
- `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/repository-operations.md`, `CHANGELOG.md`

## Verify

1. A `KiError` with `next` renders `ki: error: <message>` then `next: <step>` on stderr with the same exit code; one without renders as today.
2. With an injected `EPERM` or `EACCES` on the OneDrive root, a bound store and a candidate folder, `store list`, `store create`, `store scan` and repair report `access denied` with the platform's fix, never "missing", "not a direct directory" or an empty result; `ENOENT` still reads as missing.
3. The estate converge plan with an injected `EPERM` on an `OneDrive*` folder refuses with the denial and its `next:` instead of planning without the folder.
4. Each adopted error family (store mutations, registry invalid, selection, store roles) carries `next:` in a contract test.
5. Friction 3, 5 and 6: help text and write output carry the new lines, asserted by tests.
6. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, the command-inventory check, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md), done, whose fix strings and availability states this converts and extends.
- Builds on [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md) through KI-TOOL-KI-CLI-131.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

The product-engineering standard's new error-guidance rule; `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/repository-operations.md` (denial and its fix) and `CHANGELOG.md`.

### Roadmap

The store-reporting part moves to KI-TOOL-KI-CLI-131 (Decision 1).

## Discussion

Capture only, on Kris Brown's explicit request (decision 106), outside the thread's burn-down rule; adoption, priority and plan belong to this repository. Questions for planning: whether a folder hint for friction item 7 belongs in `.ki.toml` (an optional expected store name) or is inferred from the territory handle; whether the general rule is enforced by a test that every `KiError` thrown from a command carries a suggestion, or applied incrementally; and whether the record should split into the store work and the cross-cutting error rule.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned on 16 October 2026, settling the three planning questions above in the Decision section, and left in draft only because KI-TOOL-KI-CLI-131 is not yet done (roadmap audit ITEM-5). Set it Ready once KI-TOOL-KI-CLI-131 is accepted, re-checking the Current state against what KI-TOOL-KI-CLI-131 delivered.

Set Ready on 18 October 2026 by the `accept-ki` run of the ways-of-working Project, under Kris Brown's ACCEPT-131 a) in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, batch 4"): "a later run sets KI-TOOL-KI-CLI-136 Ready and builds it". The Current state was re-read against what KI-TOOL-KI-CLI-131 delivered; Decisions 5 and 6 settle the two points the earlier plan left open, the estate scan's denial and friction 4's changed shape, both on the conservative side.
