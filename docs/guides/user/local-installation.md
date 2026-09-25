# Maintain a local installation

Use this guide to keep an installed `ki` current, to find out what is on the machine, and to diagnose and repair user-scope state when something stops resolving. Everything here is user-scope and local: no command in this guide discovers a repository, and none of them changes what a repository declares. For repository-scope equivalents, see [audit and conform repositories](repository-operations.md).

The governing property is that these commands report before they act, and several of them only ever report. Knowing which is which saves you from expecting a fix that was never offered.

## Check what is installed and what is missing

```sh
ki manage list
ki manage outdated
ki manage missing
```

`list` inventories installed harness capabilities and declared skills. `outdated` reports an installed harness **only** when comparable newer release evidence is available — when it cannot compare, it names the unavailable evidence rather than claiming the harness is current, so a quiet `outdated` is not the same as a proven-fresh one. `missing` reports the opposite gap: a desired capability with no installed provider, which tells you which harness to install.

## Update the executable and harnesses

```sh
ki manage update
ki manage update --cli
```

`update` refreshes installed configured harnesses, and updates the executable **only** when a verified installer receipt proves that it owns the running regular installation. `--cli` requires the executable target specifically.

That ownership test is deliberate and it is the usual reason an update appears to do nothing. A linked development installation, or an externally managed one such as Homebrew, is not self-updated — `ki` will not overwrite an executable another system is responsible for. Update those through the system that installed them, or reinstall from a pinned release as in [install ki and run it for the first time](getting-started.md).

Verify with `ki --version` and `ki manage diag`, which reports the installation mode alongside the version.

## Install shell completion

```sh
ki manage completion zsh
ki manage completion bash
```

Each prints completion source derived from the registered command tree to standard output; redirect it into wherever your shell loads completions. Because it is generated from the command tree rather than hand-written, it covers every command path and valid option name without a second list to maintain.

Closed values such as roadmap horizons and statuses complete locally. Path-bearing repository selectors, capture directories, and output directories delegate to the shell's own path completion, and opaque identifiers stay user-entered. Completions never invoke `ki`, consult a network, or invent an identifier.

## Install an MCP source release

Install and activate a governed MCP server source from its GitHub repository:

```sh
ki manage mcp install owner/repository
ki manage mcp install owner/repository 1.2.3
ki manage mcp list owner/repository
```

An omitted version resolves the repository owner's latest stable GitHub Release. An explicit version selects only its exact annotated `v<SemVer>` tag. For a private repository, authenticate GitHub CLI first, then opt in deliberately:

```sh
gh auth login
ki manage mcp install owner/private-repository --auth github-cli
```

KI does not read or persist the GitHub token. It verifies the repository origin, annotated tag and full commit, KI declaration, package version, build entry point, build script, and committed Bun lockfile. It installs dependencies in frozen mode, builds in staging, writes a provenance receipt, and changes the active version only after every check passes.

Update, inspect, roll back, or remove the source with:

```sh
ki manage mcp update owner/repository
ki manage mcp list owner/repository --format json
ki manage mcp rollback owner/repository 1.2.3
ki manage mcp uninstall owner/repository
```

Complete versions remain available for rollback until uninstall. Rollback performs no fetch, dependency installation, or build. These commands manage source installations below `$KI_DATA_HOME/mcp/`; they do not bind the MCP server to ChatGPT, an editor, or another client.

## Diagnose

```sh
ki manage diag
ki manage doctor
```

`diag` prints the CLI version, installation mode, resolved paths, user configuration, registry, and managed local-development state. It changes nothing and inspects no repository declaration. Reach for it when you need to know _where_ `ki` is reading and writing — each path resolves from the first non-empty of `$KI_*_HOME`, `$XDG_*_HOME/ki`, then the `~/.local` or `~/.config` default.

`doctor` checks user configuration, configured agent skill directories, installed harnesses, and the configured KI-managed user skill links. It also reports a direct-CWD legacy `.ki-meta/` or `.ki/` directory and validates a regular direct-CWD `.ki.toml` declaration without resolving its providers. A failing check produces a non-zero exit status and still prints the complete report, so read the whole output rather than stopping at the first failure.

## Repair user skill links

```sh
ki manage repair --dry-run
ki manage repair
```

Repair reconciles configured user-skill links against installed or active local harness sources: it creates a missing link and re-points a stale or dangling symbolic link. It never changes configuration, installs a harness, or replaces a path that is not a symbolic link — anything unsafe or unavailable is reported for you to resolve by hand. Always run `--dry-run` first and read what it proposes.

This is the user-scope counterpart to `ki repo repair`. If a _repository's_ declared skill has no projection, `ki manage repair` is the wrong command.

## Find capabilities and documentation

```sh
ki manage search roadmap
ki manage docs
ki manage docs manual
```

`search` matches a required non-empty query case-insensitively against harness identifier, capability kind, and capability name across verified installed harnesses only. It contacts no registry and discovers no repository, so it answers "do I already have this?" and not "does this exist anywhere?".

`docs` prints labelled canonical documentation locations — `overview`, `site`, `manual`, and `roadmap` — or one of them when you name a topic. It prints locations; it never opens a browser or fetches content.

## Clean up

```sh
ki manage cleanup
```

Cleanup reports only stale artefacts held in a persisted, versioned KI-owned format. No such format exists yet, so at present the command reports that no eligible managed stale state exists and changes no files. It deliberately does not infer that a cache directory, a transaction-looking directory, an unconfigured harness, a link, or an unknown file is stale. If you are looking for disk space, this is not the command that will find it for you.

## Verify

```sh
ki manage doctor
ki manage diag
```

A `doctor` run exiting zero, with `diag` reporting the installation mode and paths you expect, is the healthy end state.

## Recovery

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `ki manage update` leaves the version unchanged | No installer receipt proves ownership of this executable | Update through the installing system, or reinstall from a pinned release |
| `ki manage outdated` names unavailable evidence | The comparison source could not be read | Treat freshness as unknown; do not read silence as current |
| `doctor` reports dangling user skill links | The harness source moved or was removed | `ki manage repair --dry-run`, review, then rerun |
| `doctor` reports an unsafe path it will not repair | A managed path is not a symbolic link | Inspect and resolve it by hand; `repair` will not overwrite it |
| `doctor` reports legacy `.ki-meta/` or `.ki/` | The current directory predates `.ki.toml` | Migrate that repository to a `.ki.toml` declaration |
| `ki manage cleanup` frees nothing | Expected in V1 | No action; it reports rather than deletes by design |
| A path is not where you expect | A `KI_*_HOME` or `XDG_*_HOME` override is set | Read the resolved values from `ki manage diag` |

Exact grammar is in `ki manage <command> --help` and the installed `man ki` manual. Inventory and diagnostic commands report only; update and repair act only after the ownership and safety checks described above pass.
