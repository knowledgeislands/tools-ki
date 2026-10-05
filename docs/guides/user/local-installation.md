# Maintain a local installation

Use this guide to keep an installed `ki` current, to find out what is on the machine, and to diagnose and repair user-scope state when something stops resolving. Everything here is user-scope and local: no command in this guide discovers a repository, and none of them changes what a repository declares. For repository-scope equivalents, see [audit and conform repositories](repository-operations.md).

The governing property is that these commands report before they act, and several of them only ever report. Knowing which is which saves you from expecting a fix that was never offered.

## Check what is installed and what is missing

```sh
ki inventory
ki harness outdated
ki harness missing
```

`list` inventories installed harness capabilities and declared skills. `outdated` reports an installed harness **only** when comparable newer release evidence is available — when it cannot compare, it names the unavailable evidence rather than claiming the harness is current, so a quiet `outdated` is not the same as a proven-fresh one. `missing` reports the opposite gap: a desired capability with no installed provider, which tells you which harness to install.

## Update the executable and harnesses

```sh
ki update
ki update --cli
```

`update` refreshes installed configured harnesses, and updates the executable **only** when a verified installer receipt proves that it owns the running regular installation. `--cli` requires the executable target specifically.

That ownership test is deliberate and it is the usual reason an update appears to do nothing. A linked development installation, or an externally managed one such as Homebrew, is not self-updated — `ki` will not overwrite an executable another system is responsible for. Update those through the system that installed them, or reinstall from a pinned release as in [install ki and run it for the first time](getting-started.md).

Verify with `ki --version` and `ki diag`, which reports the installation mode alongside the version.

## Install shell completion

```sh
ki completion zsh
ki completion bash
```

Each prints completion source derived from the registered command tree to standard output; redirect it into wherever your shell loads completions. Because it is generated from the command tree rather than hand-written, it covers every command path and valid option name without a second list to maintain.

Closed values such as roadmap horizons and statuses complete locally. Path-bearing repository selectors, capture directories, and output directories delegate to the shell's own path completion, and opaque identifiers stay user-entered. Completions never invoke `ki`, consult a network, or invent an identifier.

## Install an MCP source release

Install and activate a governed MCP server source from its GitHub repository:

```sh
ki mcp install owner/repository
ki mcp install owner/repository 1.2.3
ki mcp list owner/repository
```

An omitted version resolves the repository owner's latest stable GitHub Release. An explicit version selects only its exact annotated `v<SemVer>` tag. For a private repository, authenticate GitHub CLI first, then opt in deliberately:

```sh
gh auth login
ki mcp install owner/private-repository --auth github-cli
```

KI does not read or persist the GitHub token. It verifies the repository origin, annotated tag and full commit, KI declaration, package version, build entry point, build script, and committed Bun lockfile. It installs dependencies in frozen mode, builds in staging, writes a provenance receipt, and changes the active version only after every check passes.

Update, inspect, roll back, or remove the source with:

```sh
ki mcp update owner/repository
ki mcp list owner/repository --format json
ki mcp rollback owner/repository 1.2.3
ki mcp uninstall owner/repository
```

Complete versions remain available for rollback until uninstall. Rollback performs no fetch, dependency installation, or build. These commands manage source installations below `$KI_DATA_HOME/mcp/`; they do not bind the MCP server to ChatGPT, an editor, or another client.

## Declare the canonical MCP inventory

Cross-surface MCP binding resolves one `mcpServers:` YAML inventory through `$KI_MCP_SOURCE`, defaulting to `$XDG_CONFIG_HOME/ki/mcp-servers.yaml`. When that inventory lives elsewhere, name it once in `config.toml` and `ki` carries it into every command it runs and into its own process, so an in-process binding check and a spawned command agree:

```toml
[mcp]
inventory = "/absolute/path/to/mcp-servers.yaml"
```

The path must be absolute, and `inventory` is the only accepted key. An inherited non-empty `$KI_MCP_SOURCE` still wins, so a shell override stays authoritative. The file itself is not required to exist — reporting an absent or invalid inventory is a binding check's result, not a reason to stop unrelated commands. This declares which inventory describes your MCP servers; it is unrelated to the source installations that `ki mcp` builds.

## Diagnose

```sh
ki diag
ki doctor
```

`diag` prints share-safe tool/version, installation mode, executing host platform and architecture, runtime/version, configuration and registry status, and counts. Installation is `local` for an identified development checkout, `release` for the embedded compiled runtime, or `unknown` when provenance cannot be established. A source URL or filename alone is not proof: the resolved entrypoint must belong to this tool's source/package layout and have a Git checkout or valid worktree marker. Arbitrary copied source reports `unknown`, while linked checkout entrypoints resolve to `local`. Use `ki diag --full` for resolved paths, local identities, and detailed diagnostics. It changes nothing and inspects no repository declaration. Each path resolves from the first non-empty of `$KI_*_HOME`, `$XDG_*_HOME/ki`, then the `~/.local` or `~/.config` default.

`doctor` checks user configuration, configured agent skill directories, installed harnesses, and the configured KI-managed user skill links. It also reports a direct-CWD legacy `.ki-meta/` or `.ki/` directory and validates a regular direct-CWD `.ki.toml` declaration without resolving its providers. A failing check produces a non-zero exit status and still prints the complete report, so read the whole output rather than stopping at the first failure.

Doctor reports begin with the same diagnostic context, state the read-only check scope, and end with a verdict and pass/warn/fail/skipped counts. Skipped checks were not evaluated; a healthy verdict describes only the named checks, not package or release freshness. `doctor` includes actionable local findings and is not a substitute for the share-safe `diag` report.

## Repair user skill links

```sh
ki repair --dry-run
ki repair --apply
```

Repair previews reconciliation of configured user-skill links against installed or active local harness sources; `--apply` creates missing links and re-points stale or dangling symbolic links. If the user configuration has a recognised legacy `schema = 1` line, `diag --full` points it out and repair can remove that line without changing other content. Newly written configuration has no schema field; a missing field means the current shape. An unknown or noncanonical legacy marker is not repaired automatically. Repair never installs a harness or replaces a path that is not a symbolic link — anything unsafe or unavailable is reported for you to resolve by hand. Read the default or explicit `--dry-run` preview before applying; ordinary reads never rewrite configuration.

This is the user-scope counterpart to `ki repo repair`. If a _repository's_ declared skill has no projection, `ki repair` is the wrong command.

## Find capabilities and documentation

```sh
ki harness search roadmap
ki docs
ki docs manual
```

`search` matches a required non-empty query case-insensitively against harness identifier, capability kind, and capability name across verified installed harnesses only. It contacts no registry and discovers no repository, so it answers "do I already have this?" and not "does this exist anywhere?".

`docs` prints labelled canonical documentation locations — `overview`, `site`, `manual`, and `roadmap` — or one of them when you name a topic. It prints locations; it never opens a browser or fetches content.

## Clean up

```sh
ki cleanup
```

Cleanup reports only stale artefacts held in a persisted, versioned KI-owned format. No such format exists yet, so at present the command reports that no eligible managed stale state exists and changes no files. It deliberately does not infer that a cache directory, a transaction-looking directory, an unconfigured harness, a link, or an unknown file is stale. If you are looking for disk space, this is not the command that will find it for you.

## Verify

```sh
ki doctor
ki diag
```

A `doctor` run exiting zero, with `diag` reporting the installation mode and paths you expect, is the healthy end state.

## Recovery

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `ki update` leaves the version unchanged | No installer receipt proves ownership of this executable | Update through the installing system, or reinstall from a pinned release |
| `ki harness outdated` names unavailable evidence | The comparison source could not be read | Treat freshness as unknown; do not read silence as current |
| `doctor` reports dangling user skill links | The harness source moved or was removed | `ki repair --dry-run`, review, then `ki repair --apply` |
| `doctor` reports an unsafe path it will not repair | A managed path is not a symbolic link | Inspect and resolve it by hand; `repair` will not overwrite it |
| `doctor` reports legacy `.ki-meta/` or `.ki/` | The current directory predates `.ki.toml` | Migrate that repository to a `.ki.toml` declaration |
| `ki cleanup` frees nothing | Expected in V1 | No action; it reports rather than deletes by design |
| A path is not where you expect | A `KI_*_HOME` or `XDG_*_HOME` override is set | Read the resolved values from `ki diag --full` |

Exact grammar is in `ki <command> --help` and the installed `man ki` manual. Inventory and diagnostic commands report only; update and repair act only after the ownership and safety checks described above pass.
