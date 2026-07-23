---
code: CLI
---

# KI CLI roadmap

## Blocking

Actively broken, or blocking the `Next` horizon: takes priority over everything else and must clear before `Next` work proceeds. Empty means nothing is on fire.

## Next

Scoped and ready to start — the immediate queue, picked up before anything in **Soon** or **Future**.

### Establish the KI CLI seed and user installation route

Deliver the smallest installable `ki`: root help, version, completion, and a no-op `ki doctor` coming-soon response. It follows the public manual being finalised in the harness and deliberately does not dispatch user, repository, or acquisition operations yet.

**Plan:** [CLI-001](plans/CLI-001-establish-ki-cli-seed-and-installation.md)

### Publish the first release and Homebrew formula

Release and tap delivery follow a tested first `ki` version; they must package the executable without redefining its command contract.

**Plan:** [CLI-003](plans/CLI-003-publish-first-release-and-homebrew-formula.md)

### Deliver user-assisted ChatGPT acquisition

After the seed and KEP v0 specification are accepted, add the first substantive command: `ki acquire chatgpt import <capture-directory> --output <kep-directory>`. It imports only locally user-provided evidence into a deterministic KEP.

**Plan:** [CLI-002](plans/CLI-002-deliver-user-assisted-chatgpt-acquisition.md)

## Soon

Understood and roughly scoped but not yet started — worth doing once the **Next** queue clears, ahead of anything still speculative.

### Add broader user and repository lifecycle dispatch

Adopt the remaining scoped lifecycle leaves only after the seed and acquisition slices have proved the executable, installer, output, and contract model.

## Waiting for

Worth doing, but presently blocked on an external dependency or decision. Revisit when its named condition changes rather than treating it as dormant local work.

## Future

Speculative or not yet scoped — items marked _(candidate)_ need a scoping pass (or a decision to drop them) before they're actionable.
