# Local development

`tools-ki` supports released Homebrew and signed-release installations, plus an explicit link to the current checkout. The link mode exposes the checkout's unreleased version; released modes run the selected released executable.

## Run the checkout directly

Run the checkout without changing any installation:

```sh
./bin/ki --help
./bin/ki manage doctor
```

This source entry point requires Bun and runs the typed command modules in `src/` directly.

## Test shell completions

`ki manage completion` prints a script; it does not install or refresh a shell's persisted completion file. Test the checkout's current Zsh completion in the current terminal with:

```zsh
source <(./bin/ki manage completion zsh)
```

This replaces the loaded `_ki` function for that shell only. It is the right path when a development checkout changes command grammar or completion rendering.

Zsh startup normally autoloads a static `_ki` file from a directory in `fpath`, such as `~/.zsh/completions/_ki`. Restarting the terminal reloads that static file, not the checkout's freshly generated source. Update that managed file only when deliberately changing the persisted user completion configuration.

Before sourcing either script, parse its generated form:

```sh
./bin/ki manage completion bash >/tmp/ki.bash && bash -n /tmp/ki.bash
./bin/ki manage completion zsh >/tmp/ki.zsh && zsh -n /tmp/ki.zsh
```

## Develop a compatible harness locally

Keep a local harness source separate from its active projection:

```sh
ki dev local set knowledgeislands/ki-agentic-harness /path/to/ki-agentic-harness
ki dev local set humansnotrobots/hnr-agentic-harness /path/to/hnr-agentic-harness
ki dev local on
# make and test harness changes
ki dev local off
```

`set` accepts any Harness identity already present in the installed KI estate. It validates and remembers that identity and physical checkout without changing the installed Harness or managed user-skill links. Each installed Harness can have its own remembered source.

The checkout and installed Harness root both use `.ki.toml` and must retain the same `[skills.ki-repo-harness].prefix`; local mode is a mutable source for the same provider identity, not a way to change or claim a capability namespace. Release archives also carry `.ki.toml` directly—there is no retired-name translation or migration path.

`on` makes each selected checkout the complete active Harness root and reconciles that Harness's KI-managed user-skill links to their current local sources on every invocation. Metadata and payloads therefore always come from the same checkout; local mode never assembles a hybrid from an installed archive and selected linked directories. `on <harness-id>` selects one remembered Harness; `on` without an ID selects all of them.

`off` restores selected Harnesses from their configured verified archives and reprojects their links, while retaining each remembered identity and checkout for the next `on`. `off <harness-id>` selects one remembered Harness; `off` without an ID selects all of them.

Use `ki manage diag` to see every remembered source and whether its local mode is off or on; use `ki manage doctor` to identify missing, broken, or wrong-target managed links while mode is on, direct-CWD legacy `.ki-meta/` or `.ki/` directories, and invalid direct-CWD `.ki.toml` declarations.

## Command structure

`src/cli.ts` owns only command assembly, help routing, and exit-code rendering.

`src/context.ts` creates the shared `KiContext` at the host boundary. It resolves physical paths and injects process capabilities such as streams, network access, command execution, filesystem inspection, clocks, timers, and interrupt handling so command tests can replace them without changing domain code.

Each public command or command group lives under `src/commands/`, with leaf modules named after the command surface and nested command groups represented by matching directories. A command owns Commander grammar, argument and option validation, adaptation from `KiContext`, terminal presentation, and exit translation. Shared terminal primitives live under `src/commands/presentation/`; support shared only by repository commands lives under `src/commands/repo/shared/`. Keep terminal wording, trees, tables, icons, progress bars, and elapsed-time rendering on this side of the boundary.

`src/core/` is organised by domain. Focused operation modules own extracted orchestration and mutation while receiving only the capabilities they need; those operation boundaries do not import Commander, `KiContext`, command modules, or terminal presentation. Long-running operations report semantic events through injected observers so commands can stream progress as work happens without making the operation depend on a particular display. Domain entry points are their `index.ts` barrels; cross-domain infrastructure is limited to errors, paths, and the validated atomic-write boundary under `src/core/filesystem/`.

Repository selection, execution, progress events, and subprocess handling are grouped below `src/core/repository/`. Roadmap operations live below `src/core/work/`; acquisition logic lives below `src/core/acquire/`. Agora resolution and its local-client target adapters live below `src/core/agora/`; each target adapter owns one client's process invocation, while the Agora barrel exposes supported identifiers to every opening command. The observable contracts remain in the [repository operations](../../specs/repository-operations.md) and [Agora](../../specs/agoras.md) specifications rather than being duplicated here.

`src/agents/vendors/` contains vendor-specific runtime descriptors and conventions. `src/agents/shared/` contains vendor-neutral descriptor types and detection, while the top-level agent services coordinate configuration, managed skills, capability status, bootstrap, and repository activation through the public `src/agents/index.ts` boundary.

Tests exercise this composition through `run(args, context)` and the `sandbox()` helper in `src/tests/cli/_cli_helper.ts`. Add coverage at that CLI boundary: assert stdout, stderr, exit status, and sandbox filesystem effects rather than coupling tests to internal modules.

## Build a compiled executable

Build and run a standalone executable for the current platform without changing any installation:

```sh
bun run build
./dist/ki manage doctor
```

The compiled executable contains the Bun runtime and its dependency graph, so it does not need Bun on `PATH`. Public installation is deliberately release-based: `install.sh` verifies a signed archive instead of copying a mutable local build.

## Link a development command

Install a symbolic link to the current checkout into a dedicated development command directory:

```sh
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --link
PATH="$HOME/.local/ki-dev/bin:$PATH" ki manage doctor
```

`ki manage diag` reports `Installation  local` when that link is running. The command runs `src/main.ts` through Bun and the `ki(1)` link follows subsequent manual edits; reinstall only when changing target directories or replacing the link with a release installation.

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

The manual groups the intended V1 commands by purpose. Keep its command inventory, runtime registration, completion inventory, and black-box CLI contracts aligned.
