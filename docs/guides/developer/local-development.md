# Local development

`tools-ki` supports a released Homebrew installation, a regular locally compiled executable, and an explicit link to the current checkout. Both local modes expose the same unreleased version while development continues; the mode changes which executable runs, not the version number.

## Run the checkout directly

Run the checkout without changing any installation:

```sh
./bin/ki --help
./bin/ki doctor
```

This source entry point requires Bun and runs the typed command modules in `src/` directly.

## Install a compiled executable

Build the standalone executable for the current platform, then install a regular copy:

```sh
bun run build
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --copy
PATH="$HOME/.local/ki-dev/bin:$PATH" ki doctor
```

The compiled executable contains the Bun runtime and its dependency graph, so the installed command does not need a checkout or Bun on `PATH`.

## Link a development command

Install a symbolic link to the current checkout into a dedicated development command directory:

```sh
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --link
PATH="$HOME/.local/ki-dev/bin:$PATH" ki doctor
```

`ki doctor` reports `installation: linked development checkout` when that link is running. The command and `ki(1)` links follow subsequent edits to `bin/ki` and `man/ki.1`; reinstall only when changing their target directories or restoring regular copied files.

Set `KI_MAN_INSTALL_DIR` when the manual should be installed outside the default sibling `share/man/man1` directory.

## Compare with Homebrew

Keep the development directory out of `PATH`, or invoke both executables explicitly:

```sh
"$(brew --prefix ki)/bin/ki" --version
./bin/ki --version
```

The first command runs the currently installed Homebrew release. The second runs this checkout.

## Read the manual

The tracked manual is [ki(1)](../../../man/ki.1). Preview it from a checkout with:

```sh
man -l man/ki.1
```

The manual records current commands and planned alternatives separately so command names can change before the first consolidated release.
