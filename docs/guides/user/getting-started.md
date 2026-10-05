# Install ki and run it for the first time

Use this guide the first time you put `ki` on a machine. It takes you from nothing installed to a verified installation with a registered repository, and names the check that proves each step worked.

You need a POSIX shell, `curl`, and a Git checkout of at least one repository you intend to govern. Bun is not required for a released installation; it is required only for the linked development mode described in the [local development guide](../developer/local-development.md).

## Install a signed release

Every public installation pins an exact released tag. Download the installer from that tag, read it, then run it with the same tag:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' --output install.sh \
  https://raw.githubusercontent.com/knowledgeislands/tools-ki/vX.Y.Z/install.sh
bash ./install.sh vX.Y.Z
```

The installer carries a pinned public key and verifies the release's Ed25519-signed checksum manifest before it downloads any platform archive. It supports macOS on Apple Silicon and Intel, and x86_64 glibc Linux. It places the executable in `KI_CLI_INSTALL_DIR` (default `~/.local/bin`) and the manual page in `KI_MAN_INSTALL_DIR` (default the corresponding `share/man/man1` directory).

The equivalent pinned pipe form is `curl -fsSL https://knowledgeislands.info/install/ki | sh -s -- vX.Y.Z`. Omitting the version there deliberately resolves the latest release, which is convenient and is not what you want in anything reproducible.

Confirm the executable is on your path and reports the version you asked for:

```sh
ki --version
```

If the command is not found, `KI_CLI_INSTALL_DIR` is not on your `PATH`. Add it and open a new shell rather than moving the binary; `ki update` recognises only an installation it owns at its own path.

## Create the user environment

```sh
ki bootstrap
```

Bootstrap detects the supported agent runtimes on this machine, writes the user configuration if there is none, installs the built-in verified canonical harness, and links the core user skills into each configured agent's user skill directory. It reuses an existing agent configuration rather than replacing it, so running it on a machine that already has one is safe.

It refuses to complete against an installed canonical harness that is missing a required bootstrap skill, rather than leaving you with a half-activated environment. If that happens, the harness payload is the problem, not your configuration — reinstall it as described in the [capability lifecycle guide](capability-lifecycle.md).

Use `ki bootstrap --refresh` to redetect runtimes and rebuild the agent, harness, and skill-link inventory from installed state. Refresh preserves your registered local and repository settings. It is also the one-time migration path: it imports any retired configuration path list into the machine-local registry and removes the list from user configuration.

Verify:

```sh
ki diag
ki doctor
```

`diag` prints share-safe tool/version, proven installation mode, executing platform and architecture, runtime, configuration state, and registry counts without changing anything. Use `ki diag --full` for resolved paths and local identities. `doctor` reports the same context, evaluates configuration, agent skill directories, installed harnesses, and skill links, and prints its verdict and pass/warn/fail/skipped counts before exiting non-zero on a failing check. A healthy result does not mean package updates were checked.

## Register your first repository

`ki` operates on Knowledge Islands repositories: Git checkouts carrying a `.ki.toml` declaration at their root. If the checkout already has one, record it in the machine-local registry:

```sh
ki registry add --repo /path/to/repository
ki registry list
```

Registration records the canonical GitHub identity and checkout path in `$XDG_STATE_HOME/ki/registry.toml`. It applies no repairs and is not a statement that the repository conforms to anything — it is an inventory, so that later operations can find the repository by name instead of by path.

If the checkout has no `.ki.toml`, create one from inside the existing Git worktree root:

```sh
ki repo init \
  --repository https://github.com/example/example \
  --title 'Example repository' \
  --description 'An explicit KI repository identity.' \
  --repo-code EXAMPLE \
  --runtime claude-code \
  --visibility private
```

Initialisation writes a Project declaration with explicit `repo_type = "project"` and `primary_shape = "ki-repo-project"` under `[skills.ki-repo]`, declares `[skills.ki-repo-project]`, and registers that physical root. Select another declared core shape when the repository has a different primary responsibility. A Knowledge Base requires `repo_type = "kb"`, `primary_shape = "ki-repo-kb"`, the declared KB skill, and its store roles. Neither classification field is inferred. Initialisation never runs `git init`, guesses an identity, activates skills, creates an Agora, or overwrites a declaration that already exists.

Verify:

```sh
ki repo diag --repo /path/to/repository
```

This reports the repository's declared skills and their local projections without changing state.

## What to read next

- Add governing skills to the repository, or install another harness: [capability lifecycle](capability-lifecycle.md).
- Run audits and conform across one repository or many: [repository operations](repository-operations.md).
- Keep the installation current and diagnose it when something drifts: [maintain a local installation](local-installation.md).

For exact grammar of any command here, use `ki <command> --help` or the installed `man ki` manual. This guide owns the order and the checks; the manual owns the options.

## Recovery

- `ki: command not found` after install — Likely cause: `KI_CLI_INSTALL_DIR` is not on `PATH`. Action: Add the directory to `PATH` and start a new shell.

- Bootstrap refuses, naming a missing bootstrap skill — Likely cause: The installed canonical harness payload is incomplete. Action: Reinstall the harness, then rerun `ki bootstrap`.

- `ki doctor` reports dangling skill links — Likely cause: Links point at a harness source that has moved. Action: Run `ki repair --dry-run`, review, then run `ki repair --apply`.

- `ki repo diag` reports a direct-CWD legacy `.ki-meta/` or `.ki/` — Likely cause: The checkout predates the current declaration format. Action: Migrate it to `.ki.toml`; `ki doctor` reports the same condition.

- A registry entry points at a path that no longer exists — Likely cause: The checkout moved or was deleted. Action: Re-run `ki registry add --repo <new-path>` for the current root.
