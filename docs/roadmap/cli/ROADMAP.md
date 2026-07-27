---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

### Repair verified release-installer contract for CI

Make the public `ki` installation contract self-contained, cryptographically verified, and reproducible on a clean hosted Linux runner. A caller following the documented path must receive every verification input without discovering an adjacent key file, while release evidence must be immutable or satisfy an explicitly verified equivalent integrity contract. This is the `tools-ki` prerequisite for fleet CI rollout; it does not permit checkout, package-alias, vendored, or unsigned fallback execution.

**Plan:** [CLI-005](plans/CLI-005-repair-verified-release-installer-contract.md)

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Define `ki missing` and `ki outdated` capability status

Define the desired capability set and release-status evidence required for read-only `ki missing` and `ki outdated` reports. Preserve the distinction between installed verified harnesses, active user or repository declarations, and releases that have not yet been acquired.

**Plan:** [CLI-001](plans/CLI-001-define-missing-and-outdated-capability-status.md)

### Host generated rubric-publication capability

Provide the narrow host capability required for `ki repo audit` and `ki repo conform` to assess and publish generated skill rubric publications. The host owns validated catalogue loading, canonical rendered bytes, guarded transactional publication, rollback, re-audit, and standalone parity. The harness's `ki-skills` capability owns the policy criterion, drift findings, and derived write proposals; neither side duplicates the other's concern.

**Plan:** [CLI-002](plans/CLI-002-host-generated-rubric-publication-capability.md)

### Deliver `ki install`, `ki reinstall`, and `ki uninstall` capability lifecycle

Define and implement lifecycle commands for a named compatible capability or its supplying harness without duplicating `ki harness` operations or bypassing explicit `ki user` and `ki repo` activation scope. Settle target identity, replacement, removal, dry-run, and safe ownership semantics first.

**Plan:** [CLI-003](plans/CLI-003-deliver-capability-lifecycle.md)

### Deliver package and harness update–upgrade operations

Define and implement `ki update` and CWD-resolved `ki upgrade` for compatible packages or harnesses. Respect the selected CLI distribution, verified immutable acquisition evidence, and explicit user or repository activation boundaries; do not treat a generic executable self-update as universal across Homebrew and installer deployments.

**Plan:** [CLI-004](plans/CLI-004-deliver-update-upgrade-operations.md)

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

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
