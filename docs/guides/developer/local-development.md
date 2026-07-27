# Local development

`tools-ki` supports released Homebrew and signed-release installations, plus an explicit link to the current checkout. The link mode exposes the checkout's unreleased version; released modes run the selected released executable.

## Run the checkout directly

Run the checkout without changing any installation:

```sh
./bin/ki --help
./bin/ki doctor
```

This source entry point requires Bun and runs the typed command modules in `src/` directly.

## Command structure

`src/cli.ts` owns only command assembly, help routing, and exit-code rendering.

Each public command or command group has its own module under `src/commands/`; command modules receive one shared read-only execution context rather than inspecting process state independently.

`src/core/context.ts` resolves the physical current working directory, executable installation mode, XDG KI paths, user home, and an optional ancestor KI repository. Repository discovery searches from the working directory upward for `.ki-config.toml`, but never treats the home directory or filesystem root as a repository. Future `ki repo` commands reuse this context and its explicit `--repo` resolver rather than reimplementing path traversal.

## Build a compiled executable

Build and run a standalone executable for the current platform without changing any installation:

```sh
bun run build
./dist/ki doctor
```

The compiled executable contains the Bun runtime and its dependency graph, so it does not need Bun on `PATH`. Public installation is deliberately release-based: `install.sh` verifies a signed archive instead of copying a mutable local build.

## Link a development command

Install a symbolic link to the current checkout into a dedicated development command directory:

```sh
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --link
PATH="$HOME/.local/ki-dev/bin:$PATH" ki doctor
```

`ki doctor` reports `installation: linked development checkout` when that link is running. The command runs `src/main.ts` through Bun and the `ki(1)` link follows subsequent manual edits; reinstall only when changing target directories or replacing the link with a release installation.

Set `KI_MAN_INSTALL_DIR` when the manual should be installed outside the default sibling `share/man/man1` directory.

## PATH precedence

The first `ki` directory in `PATH` wins. If Homebrew's `bin` directory comes before the linked development directory, `ki` runs the Homebrew release instead of this checkout.

To make the default linked installation take precedence, place the local bin directory before Homebrew in the shell startup configuration:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Open a new shell, or run `rehash` in Zsh, after changing `PATH`. Use `command -v ki` or `which -a ki` to inspect the selected executable and all available candidates.

## Compare with Homebrew

To compare the two installations without changing `PATH`, invoke both executables explicitly:

```sh
"$(brew --prefix ki)/bin/ki" --version
./bin/ki --version
```

The first command runs the currently installed Homebrew release. The second runs this checkout.

## Release work

Release signing, protected GitHub environment configuration, and publication are covered by the [release management guide](release-management.md).

## Read the manual

The tracked manual is [ki(1)](../../../man/ki.1). Preview it from a checkout with:

```sh
man -l man/ki.1
```

The manual groups current and planned commands together by purpose; `[planned]` forms can change before the first consolidated release.
