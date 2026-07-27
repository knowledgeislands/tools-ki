---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

### Activate skills only for compatible runtimes

Read explicit runtime compatibility from installed skill metadata and link a user- or repository-scoped skill only into configured agents for compatible runtimes. Keep removal broad enough to clean stale KI-managed projections after compatibility changes.

Received from `ki-agentic-harness` [RTP-002](../../../../ki-agentic-harness/docs/roadmap/runtime-portability/plans/RTP-002-runtime-explicit-environment-capabilities.md); blocks completion of that plan's fleet migration.

**Plan:** [CLI-003](plans/CLI-003-activate-skills-only-for-compatible-runtimes.md)

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Deliver `ki list` capability inventory

Deliver a read-only inventory of verified installed harnesses and their capabilities, declared user skills, and CWD-resolved repository skills. Retain `ki harness list` as the harness-focused summary and make no release, desired-state, or mutation claim.

**Plan:** [CLI-001](plans/CLI-001-deliver-ki-list-capability-inventory.md)

### Exit `ki doctor` non-zero on failing checks

`ki doctor` prints `✗` for failing checks (missing configuration, missing harnesses, unlinked skills) but always exits 0, so it can't be used as a script/CI gate. Decide the exit-code contract (e.g. non-zero if any check is `fail`) and update the CLI-005 contract test at `src/tests/cli/doctor.test.ts` alongside the fix.

**Plan:** [CLI-002](plans/CLI-002-exit-ki-doctor-non-zero-on-failing-checks.md)

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

### Define `ki missing` and `ki outdated` capability status

Define the desired capability set and release-status evidence required for read-only `ki missing` and `ki outdated` reports. Preserve the distinction between installed verified harnesses, active user or repository declarations, and releases that have not yet been acquired.

### Deliver `ki install`, `ki reinstall`, and `ki uninstall` capability lifecycle

Define and implement lifecycle commands for a named compatible capability or its supplying harness without duplicating `ki harness` operations or bypassing explicit `ki user` and `ki repo` activation scope. Settle target identity, replacement, removal, dry-run, and safe ownership semantics first.

### Deliver package and harness update–upgrade operations

Define and implement `ki update` and CWD-resolved `ki upgrade` for compatible packages or harnesses. Respect the selected CLI distribution, verified immutable acquisition evidence, and explicit user or repository activation boundaries; do not treat a generic executable self-update as universal across Homebrew and installer deployments.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes rather than treating it as dormant local work.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.

### Persist qualified capability identities in repository declarations _(candidate)_

Require each declared skill in `.ki-config.toml` to carry its resolved `<harness-id>:<skill-name>` identity, rather than retaining a bare skill name after resolution. Choose a TOML representation that remains safe and legible, update activation, resolver, migration, diagnostics, and fixtures together, and migrate every existing declaration in one current-state change. Do not retain bare-name fallback or dual configuration paths after the migration; ambiguity should be impossible from the repository declaration itself.

### Harden user harness installation and runtime skill publication

Make runtime skill publication fail-safe, runtime-selected, and independently testable on top of the user-level contract `ki bootstrap` now owns. Assess whether the harness's local hook-installer subprocess can become an import-safe direct call without weakening user-space failure isolation. Preserve unrelated user files and refuse unsafe parents. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.

### Define cross-repository skill vendor provenance _(candidate)_

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or an ambient filesystem path. Assess an explicit `repository-id:skill:module` dependency identity, such as `ki-agentic-harness:ki-skills:reporter`, alongside repository identifiers, version or revision pinning, integrity, acquisition, missing-provider and conflict handling, and release packaging. Keep the rule that only a provider in the same physical harness checkout may be symlinked; an external provider must arrive through an explicit portable vendor or installation contract. Complements the capability package-management commands item in **Soon**. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.
