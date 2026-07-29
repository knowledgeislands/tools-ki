---
id: KI-TOOL-CLI-003
title: Add native governed-work inspection commands
theme: cli
horizon: next
status: acceptance
blocks: []
blocked-by: []
baseline-ref: c378a72eeaac094be40962080da3264dfdfd0542
---

## Context

Expose governed work items through a read-only native `ki repo plan` command group, beginning with `list`, without making `ki` the owner of lifecycle transitions.

## Boundary

This item does not implement lifecycle transitions, confirmation prompts, creation, readiness, implementation, acceptance, path- or glob-selected pruning, or repair. It does not add a second target-selection path: the existing shared repository resolver owns target selection.

## Current state

`ki repo` now resolves explicit, workspace, and direct-CWD repository target sets through one shared resolver, but exposes no native work-item inventory. Canonical governed work lives in physical regular Markdown files directly below `docs/roadmap/`; its lifecycle status is independent of its open roadmap scope, and the harness owns both format and lifecycle.

The inventory needs a deliberately read-only parser and result model that can consume any resolved repository target set, including KI-owned workspace groups.

### Inventory contract

`ki repo plan list` will consume the existing resolved target set and default to deterministic text output grouped by repository. Each governed item will expose its identifier, title, theme, horizon, lifecycle status, dependency identifiers, baseline reference, and the Future candidate flag where required. `list` is the complete initial native inspection surface; any later command must earn a separate authority and confirmation design.

`--format json` will emit the same stable fields in one object containing ordered repository results and isolated diagnostics. `--horizon <value>` and `--status <value>` will filter items before rendering; an empty successful result remains distinct from a malformed work-item diagnostic.

Malformed or unsafe work-item files fail only their repository result after target selection; other resolved repositories still report. The command never creates, repairs, transitions, accepts, prunes, or rewrites a work item.

## Steps

1. ✓ Add a contained, read-only inventory module that enumerates only physical regular Markdown files directly below a selected repository's `docs/roadmap/`, refusing symbolic links, non-files, and path escapes before reading them.
2. ✓ Parse only the canonical frontmatter subset (`id`, `title`, `theme`, `horizon`, `status`, `candidate`, `blocks`, `blocked-by`, `baseline-ref`, and optional `transferred-from`), validate identity and lifecycle values, and derive an immutable item model without introducing a general YAML parser or mutating any work item.
3. ✓ Add `ki repo plan list [--format text|json] [--horizon <value>] [--status <value>]`, reusing `resolveRepositoryTargets()`. Sort repository results by selected-target order and items by identifier; filter before rendering; render one stable JSON document or deterministic grouped text.
4. ✓ Preserve selection's all-or-nothing preflight, then isolate each selected repository's missing roadmap directory, malformed item, invalid lifecycle status, or unsafe entry as that repository's diagnostic while other selected repositories still return their inventories.
5. ✓ Register the repository `plan` group and its initial `list` subcommand in root help and generated completions, retaining the `ki-plan` skill as the sole lifecycle owner.
6. ✓ Add black-box contracts for lifecycle statuses, exact text and JSON schemas, filters, empty inventories, malformed and unsafe files, workspace and explicit target sets, and independent multi-target results.
7. ✓ Update `ki(1)`, README, and developer guidance with the inventory/lifecycle boundary, and prepare the non-blocking public-guidance handoff for `ki-website`.

## Files touched

- `src/commands/repo.ts`, a focused plan-inventory command module, a contained work-item inventory module under `src/core/`, registration, and completion modules
- `src/tests/cli/` inventory fixtures and contracts
- `man/ki.1`, README, developer documentation, and a non-blocking KI Website handoff for public user guidance

## Verify

1. `bunx tsc --noEmit`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove deterministic, read-only inventory, exact text/JSON schemas, filter behaviour, direct-child containment, selector reuse, and isolated per-target diagnostics.

## Dependencies / blocks

The shared repository selector is available for this item. CLI-003 does not block workspace selection: it consumes an already-delivered selector only when available.

## Delegation

No worker dispatch is authorised by this shaping record. If implementation is delegated after readiness, the plan must first record a cold-agent-ready brief for each bounded worker: locked and escalated decisions, explicit minimum-viable per-spawn model, file scope, pass/fail definition of done, verification gate, completion checkpoint, and dependency-ordered rounds. The orchestrator retains public output-contract judgment, reviews every diff, and runs the final gate.

## Acceptance

### Delivered

`ki repo plan list` is now a native, read-only repository command with text and JSON output plus horizon and lifecycle-status filters.

### Summary of changes

The command reuses repository and workspace target selection, inventories direct physical roadmap files through a narrow canonical-frontmatter parser, and reports each selected repository independently. It accepts the standard lifecycle and Future candidate semantics without changing work-item state. Help, completions, the manual, README, developer guidance, changelog, and a non-blocking KI Website handoff now expose the command surface and its authority boundary.

### Verification

- `bunx biome check src/commands/catalogue.ts src/commands/repo.ts src/commands/plan.ts src/core/work-items.ts src/tests/cli/completions.test.ts src/tests/cli/help.test.ts src/tests/cli/plan.test.ts`
- `bunx tsc --noEmit`
- `bun run test:coverage` — 405 tests passed; statements, branches, functions, and lines are all 100%.
- `./bin/ki repo audit --repo .`
- `mandoc -T lint man/ki.1`, Markdown formatting and linting, and `git diff --check`.
- A direct `./bin/ki repo plan list --format json` smoke test reports this repository's in-progress item and its Future candidate records.

### Outstanding concerns

None. Future lifecycle operations remain deliberately out of scope and require their own authority and confirmation design.

### Mini recap

CLI-003 is ready for explicit user acceptance; no lifecycle transition or pruning has been performed by the new command.

## Discussion

### Authority boundary

`ki repo plan list` reads and validates canonical work items across their valid lifecycle statuses but does not create, transition, accept, prune, or otherwise own that lifecycle. Harness-owned work-item semantics remain the source of truth; malformed items must be isolated as diagnostics rather than normalised or repaired by the inventory command.

### Result contract

The contract uses text by default and JSON only through an explicit `--format json`. It must distinguish an empty inventory from a repository whose malformed, invalid-status, or unsafe item prevents one result from being read.

### Parsing boundary

The inventory owns a deliberately narrow canonical-frontmatter reader, not a general Markdown or YAML service. It reads only the fields that the governed work-item format makes stable, rejects unsupported or malformed structure with an item diagnostic, and leaves all prose outside the frontmatter untouched and semantically opaque.

### Process ownership

`ki-plan` owns this item's shaping and any later Ready transition. `ki-implement` alone may record the immutable baseline, execution evidence, and Acceptance packet; `ki-accept` alone may close it or prune a selected done record by explicit path or glob. `ki repo plan list` reports canonical state but does not emulate any of those lifecycle operations.

### Workspace reuse

CLI-003 owns no workspace selection. Its target-set input and per-repository result model deliberately accept the existing selector, without making workspace support a prerequisite.

### Consolidated CLI-007 scope

CLI-007's concrete inspection intent is consolidated here: `ki repo plan` is the native inspection supercommand and `list` is its initial operation. CLI-007's undefined future mutation or orchestration idea is not carried forward because it lacks a demonstrated need, a lifecycle authority, and a confirmation model.

### Dependency boundary

This item consumes the shared target-set resolver and per-target reporting model. It must not add its own multi-repository selection or failure-isolation path.
