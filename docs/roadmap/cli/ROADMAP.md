---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Deliver native repository maintenance through registered skills

Implement the first repository-maintenance slice without dispatching vendored `.ki/bin` runners: install verified XDG-located compatible harnesses, activate their declared capabilities explicitly at user or repository scope, resolve `.ki-config.toml` declarations, and run registered native `ki repo audit` and `ki repo conform` operations. Preserve scoped ownership, physical repository resolution, dry-run, safe writes, and actionable recovery; do not release, tag, or update Homebrew as part of this implementation plan.

**Plan:** [CLI-004](plans/CLI-004-native-repo-maintenance.md)

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
