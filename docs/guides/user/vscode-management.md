# Manage local VS Code projections

Use `ki manage vscode` when a chezmoi source owns the machine's VS Code workspace files and shared agent trusted-folder inventory. The command derives repository folders, explicit `sources` bindings, and permitted runtime clients from the local KI registry and each repository's `.ki.toml`. It ignores `legacy` bindings and never infers stores from directory names.

## Check and synchronise

Inspect source-state drift without writing:

```sh
ki manage vscode check
```

The check reports a source diff and exits non-zero when a registered repository needs a conventional workspace or the trusted-folder inventory needs refreshing. Existing multi-root workspaces, settings, and special filenames are preserved.

After reviewing the source diff, publish the reconciliation:

```sh
ki manage vscode sync --write
chezmoi diff
```

The write changes only chezmoi source state. It never runs `chezmoi apply`; review and apply rendered targets through the owning dotfiles workflow.

Manage the repository's declared stores first with `ki repo store`; then rerun `ki manage vscode check`. See [repository operations](repository-operations.md#manage-declared-stores) for listing, binding, managed source creation, and non-destructive unbinding.
