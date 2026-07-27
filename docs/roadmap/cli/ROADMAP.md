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

### Complete remaining user and repository lifecycle commands

After native repository maintenance proves the installed-skill model, adopt the remaining scoped user and repository lifecycle leaves. Keep every command's ownership and safety boundary explicit; do not add compatibility dispatch to retired vendored runners.

### Define capability package-management commands

Specify the inventory, status, maintenance, and upgrade forms around compatible harnesses and their typed capabilities: `ki list`, `ki harness list`, `ki missing`, `ki outdated`, `ki install`, `ki reinstall`, `ki uninstall`, `ki update`, and CWD-resolved `ki upgrade`. Use Homebrew and Cargo as behavioural exemplars while retaining KI's verified-harness and explicit-scope model.

### Ship `ki(1)` through supported distributions

The source `ki(1)` manual and local-development preview are delivered with the CLI foundation. Package it in supported distributions, including the eventual Homebrew formula, and keep it aligned with `ki help`; it must distinguish released commands from planned work.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes rather than treating it as dormant local work.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.

### Persist qualified capability identities in repository declarations _(candidate)_

Require each declared skill in `.ki-config.toml` to carry its resolved `<harness-id>:<skill-name>` identity, rather than retaining a bare skill name after resolution. Choose a TOML representation that remains safe and legible, update activation, resolver, migration, diagnostics, and fixtures together, and migrate every existing declaration in one current-state change. Do not retain bare-name fallback or dual configuration paths after the migration; ambiguity should be impossible from the repository declaration itself.

### Exit `ki doctor` non-zero on failing checks _(candidate)_

`ki doctor` prints `✗` for failing checks (missing configuration, missing harnesses, unlinked skills) but always exits 0, so it can't be used as a script/CI gate. Decide the exit-code contract (e.g. non-zero if any check is `fail`) and update the CLI-005 contract test at `src/tests/cli/doctor.test.ts` alongside the fix.

### Harden user harness installation and runtime skill publication

Make runtime skill publication fail-safe, runtime-selected, and independently testable on top of the user-level contract `ki bootstrap` now owns. Assess whether the harness's local hook-installer subprocess can become an import-safe direct call without weakening user-space failure isolation. Preserve unrelated user files and refuse unsafe parents. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.

### Define cross-repository skill vendor provenance _(candidate)_

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or an ambient filesystem path. Assess an explicit `repository-id:skill:module` dependency identity, such as `ki-agentic-harness:ki-skills:reporter`, alongside repository identifiers, version or revision pinning, integrity, acquisition, missing-provider and conflict handling, and release packaging. Keep the rule that only a provider in the same physical harness checkout may be symlinked; an external provider must arrive through an explicit portable vendor or installation contract. Complements the capability package-management commands item in **Soon**. Received from the `ki-agentic-harness` Foundation Tooling roadmap (2026-07-26); blocks nothing on either side.
