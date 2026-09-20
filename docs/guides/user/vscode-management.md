# Manage local VS Code projections

Use `ki manage vscode` when a chezmoi source owns the machine's VS Code workspace files and shared agent trusted-folder inventory. The command derives repository folders and their permitted runtime clients from the local KI registry and each repository's `.ki.toml`.

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

## Create a source store

Preview an opt-in OneDrive source store for one registered repository:

```sh
ki manage vscode source create <repository>
```

Supply the exact registered repository basename or its absolute path. After reviewing the plan, create the directory and associate it with the repository's managed workspace:

```sh
ki manage vscode source create <repository> --write
chezmoi diff
```

Existing `sources-<name>` directories may use a shorter historical suffix only when it identifies one registered repository unambiguously. Missing or ambiguous associations fail before any source-state write.

Do not create source stores speculatively or use them for credentials. They are for opted-in binary, media, acquisition, or other working material unsuitable for Git.
