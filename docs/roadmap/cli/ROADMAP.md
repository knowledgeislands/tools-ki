---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Harden user harness installation and runtime skill publication

Make runtime skill publication fail-safe, runtime-selected, and independently testable on top of the user-level contract `ki bootstrap` now owns. Assess whether the harness's local hook-installer subprocess can become an import-safe direct call without weakening user-space failure isolation. Preserve unrelated user files and refuse unsafe parents. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.

**Plan:** [KI-CLI-CLI-001](plans/KI-CLI-CLI-001-harden-user-harness-publication.md)

### Evaluate release-please for KI CLI releases

Trial [release-please](https://github.com/googleapis/release-please) against a real `tools-ki` release cadence. Assess its Conventional Commits and release-PR model against the repository's direct-main workflow, existing version and changelog records, release artifact publication, installer evidence, and Homebrew update path. Adopt it only if the trial produces a simpler, reviewable release boundary; do not make it a `ki-tools` standard or a required workflow before it has proven repeatable.

**Plan:** [KI-CLI-CLI-002](plans/KI-CLI-CLI-002-evaluate-release-please.md)

### Add native governed-plan inventory

Expose the governed plans already present in a resolved KI repository through a read-only `ki plan list` command. Report each plan's qualified identifier, title, status, canonical roadmap locator, dependency edges, and baseline reference; support stable machine-readable output without making the CLI the owner of plan semantics or lifecycle transitions.

**Plan:** [KI-CLI-CLI-003](plans/KI-CLI-CLI-003-add-native-governed-plan-inventory.md)

### Add explicit KI workspaces

Let a user define a named, explicit set of KI repository roots and query their governed-plan inventory through `ki workspace`. Start read-only: physical-root validation, deterministic ordering, isolated per-repository diagnostics, and an aggregate plan view. Do not recursively scan ambient folders or introduce multi-repository mutation fan-out in the first capability.

**Plan:** [KI-CLI-CLI-004](plans/KI-CLI-CLI-004-add-explicit-ki-workspaces.md)

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes; do not use this horizon for intentionally paused work.

## Parked

Intentionally paused work with no current attention. Revisit only when its priority or named return trigger changes.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.

### Define cross-repository skill vendor provenance _(candidate)_

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or an ambient filesystem path. Assess an explicit `repository-id:skill:module` dependency identity, such as `ki-agentic-harness:ki-skills:reporter`, alongside repository identifiers, version or revision pinning, integrity, acquisition, missing-provider and conflict handling, and release packaging. Keep the rule that only a provider in the same physical harness checkout may be symlinked; an external provider must arrive through an explicit portable vendor or installation contract. Complements the capability package-management commands item in **Soon**. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.
