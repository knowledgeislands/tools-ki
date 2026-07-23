---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Deliver user-assisted ChatGPT acquisition

After the seed and KEP v0 specification are accepted, add the first substantive command: `ki acquire chatgpt import <capture-directory> --output <kep-directory>`. It imports only locally user-provided evidence into a deterministic KEP.

**Plan:** [CLI-002](plans/CLI-002-deliver-user-assisted-chatgpt-acquisition.md)

### Deliver native repository maintenance through registered skills

Implement the first repository-maintenance slice without dispatching vendored `.ki/bin` runners: install one verified XDG-located skill collection, activate named skills explicitly in global or repository scope, resolve `.ki-config.toml` declarations, and run registered native `ki repo audit` and `ki repo conform` operations. Preserve scoped ownership, physical repository resolution, dry-run, safe writes, and actionable recovery; do not release, tag, or update Homebrew as part of this implementation plan.

**Plan:** [CLI-004](plans/CLI-004-native-repo-maintenance.md)

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

### Complete remaining user and repository lifecycle commands

After native repository maintenance proves the installed-skill model, adopt the remaining scoped user and repository lifecycle leaves. Keep every command's ownership and safety boundary explicit; do not add compatibility dispatch to retired vendored runners.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes rather than treating it as dormant local work.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.
