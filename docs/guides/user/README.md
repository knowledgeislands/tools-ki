# tools-ki user guides

These guides are for people and agents operating `ki` against Knowledge Islands repositories. Contributor mechanics for changing the CLI itself are in the [developer guides](../developer/README.md).

## Start here

If `ki` is not yet on this machine, or you have never run it, read these three in order. Between them they take you from nothing installed to a governed repository you can audit.

1. [Install ki and run it for the first time](getting-started.md) — install a signed release, create the user environment with `ki bootstrap`, and register your first repository.
2. [Install harnesses and activate their skills](capability-lifecycle.md) — where capabilities come from, and the difference between installing a harness and activating one of its skills in user or repository scope.
3. [Audit and conform repositories](repository-operations.md) — selecting targets with `--repo`, `--agora`, and `--estate`, reading an audit, and applying a conform safely.

## Keep it working

- [Maintain a local installation](local-installation.md) — update the executable and harnesses, install shell completion, diagnose with `diag` and `doctor`, and repair user skill links.
- [Manage local VS Code projections](vscode-management.md) — reconcile the chezmoi-owned workspace inventory and trusted-folder source state against the registry.

## Bring material in

- [Import a local ChatGPT capture](chatgpt-capture.md) — assemble a conforming capture directory and turn it into a Knowledge Exchange Package, entirely locally.
- [Acquire Granola meetings](granola-acquisition.md) — activate the adapter, import read-only meeting evidence, resume interrupted work, and govern reset or disposition.
- [Standing knowledge intake](standing-knowledge-intake.md) — establish reciprocal knowledge grants and capture commit-pinned provenance into an existing note.

## Govern work across repositories

- [Associate external Agora references](agora-references.md) — connect ordinary Git checkouts to an Agora working set without turning them into KI members.
- [Canonical batch records](batch-records.md) — prepare, bind, record, and close exact-set batch authority envelopes over already-approved work.
- [Repository-local governance](repository-local-governance.md) — declare and run a repository-owned `ki-self` capability.

## Where else to look

Each guide owns its procedure. For exact command grammar use `ki <command> --help` or the installed `man ki` manual; each guide states the operational behaviour needed to complete, verify, and recover its outcome.
