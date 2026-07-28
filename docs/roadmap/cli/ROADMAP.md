---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

### Persist qualified capability identities in repository declarations

Migrate every declared repository skill to one `harness-id:skill-name` TOML representation. Define the shape, update activation, resolver, diagnostics, fixtures, and all existing declarations together, and reject bare names with no compatibility fallback.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes rather than treating it as dormant local work.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.

### Harden user harness installation and runtime skill publication

Make runtime skill publication fail-safe, runtime-selected, and independently testable on top of the user-level contract `ki bootstrap` now owns. Assess whether the harness's local hook-installer subprocess can become an import-safe direct call without weakening user-space failure isolation. Preserve unrelated user files and refuse unsafe parents. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.

### Define cross-repository skill vendor provenance _(candidate)_

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or an ambient filesystem path. Assess an explicit `repository-id:skill:module` dependency identity, such as `ki-agentic-harness:ki-skills:reporter`, alongside repository identifiers, version or revision pinning, integrity, acquisition, missing-provider and conflict handling, and release packaging. Keep the rule that only a provider in the same physical harness checkout may be symlinked; an external provider must arrive through an explicit portable vendor or installation contract. Complements the capability package-management commands item in **Soon**. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.
