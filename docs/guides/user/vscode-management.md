# Manage local VS Code projections

Use `ki vscode` when a chezmoi source owns the machine's VS Code workspace files and shared agent trusted-folder inventory. The command derives repository folders, explicit `sources` bindings, and permitted runtime clients from the local KI registry and each repository's `.ki.toml`. It ignores `legacy` bindings and never infers stores from directory names.

## Check and synchronise

Inspect source-state drift without writing:

```sh
ki vscode check
```

The check reports a source diff and exits non-zero when a registered repository needs a conventional workspace, workspace folders no longer exist, or the trusted-folder inventory needs refreshing. Review deletion previews for obsolete projects as well as additions for current repositories.

After reviewing the source diff, publish the reconciliation:

```sh
ki vscode sync --write
chezmoi diff
```

The write changes only chezmoi source state. It never runs `chezmoi apply`; review and apply rendered targets through the owning dotfiles workflow.

Sync removes folder entries whose paths no longer resolve to directories. If every folder in a project is missing, it deletes that `.code-workspace` source file and removes its paths from the trusted-folder inventory. It preserves live folders, their metadata, workspace settings, special filenames, and intentionally empty workspaces. Existing projects remain even when their folders are outside the KI registry.

Missing registered checkouts are skipped during projection without changing the registry. Restore a checkout before syncing if it is temporarily unavailable and you want to keep its project. A conventional workspace for a moved repository is regenerated at the current registered path.

Manage the repository's declared stores first with `ki repo store`; then rerun `ki vscode check`. See [repository operations](repository-operations.md#manage-declared-stores) for listing, binding, managed source creation, and non-destructive unbinding.
