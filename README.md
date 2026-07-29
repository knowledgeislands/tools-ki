# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agentic-harness), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-arcadia-principal) remains the source of Knowledge Islands philosophy and model. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md) defines the five authorities and publication flows.

The seed delivery established the `ki` command channel. The active TypeScript command host provides help, version, XDG inspection, and a user-assisted `ki acquire chatgpt import` command that produces a Knowledge Export Package (KEP).

## Acquire a local ChatGPT capture

Prepare a capture using the [controlled local-capture format](https://knowledgeislands.info/guidance/cli/chatgpt-local-capture/), then import it into a new output directory:

```sh
ki acquire chatgpt import ./capture --output ./conversation.kep
```

Use `--dry-run` to validate without creating output. The command is local only: it does not contact ChatGPT, automate a browser, read credentials, discover a repository, or extract knowledge.

## Manage installed capabilities

`ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage verified harness payloads without activating or deactivating skills.

Use a harness identifier such as `example/harness`.

For the installation and activation boundary, read the [capability lifecycle guide](https://knowledgeislands.info/guidance/cli/capability-lifecycle/).

## Update verified installations

`ki update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki repo upgrade` refreshes the uniquely resolved providers declared by one or more selected KI repositories.

Neither command changes user or repository skill activation; read the [update and upgrade guide](https://knowledgeislands.info/guidance/cli/update-upgrade/) for target selection and ownership boundaries.

## Select repository targets

Every `ki repo` operation accepts repeated `--repo <path-or-pattern>` options or one `--workspace <group>` option. The two explicit selectors are mutually exclusive. Literal paths and patterns resolve to physical KI repository roots in deterministic order; an unmatched pattern, invalid root, or duplicate root stops the operation before any target runs.

Use `ki workspace init` in a workspace directory to create a KI-owned `.ki-workspace.toml`, then add ordered repository paths or patterns to named groups. A regular direct-CWD workspace file takes precedence when no selector is supplied: its default group is selected before a direct-CWD `.mgit-config.toml`. `--workspace <group>` selects a named group explicitly. Workspace members resolve relative to the workspace directory; KI never searches ancestor directories for a workspace or `mgit` configuration.

Without an explicit selector or direct-CWD workspace, `ki` reads a regular direct-CWD `.mgit-config.toml` and follows its `members` table through standard repositories, nested `main/` checkouts, and `dir` containers. It ignores mGit `symlinks` and bare stores, and never invokes `mgit`. Without a direct-CWD configuration, it retains single-repository discovery from the working directory.

After target selection, operations run in target order. Read-only operations isolate a target's diagnostic; mutations retain earlier successful targets if a later target fails and return a non-zero overall result.

```sh
ki workspace init
ki workspace add default 'repos/*'
ki workspace add release ../release-repositories/*
ki repo diag
ki repo --workspace release audit
```

## Inspect governed work

`ki repo plan list` reads the canonical work-item records in selected repositories without changing their lifecycle.

It groups deterministic text output by repository; use `--format json` for the same fields in one stable JSON document, and use `--horizon <value>` or `--status <value>` to filter records.

Malformed or unsafe work items become a diagnostic for only that selected repository, while other selected repositories still report. The command never creates, transitions, accepts, prunes, or repairs work items; the harness process skills remain their lifecycle authority.

## Install

After the first immutable release, download `install.sh` from an exact released tag, inspect it, then run it with that tag:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' --output install.sh \
  https://raw.githubusercontent.com/knowledgeislands/tools-ki/vX.Y.Z/install.sh
bash ./install.sh vX.Y.Z
```

The installer carries the pinned public key and verifies the release's Ed25519-signed checksum manifest before downloading the platform archive. It supports macOS (Apple Silicon and Intel) and x86_64 glibc Linux. Use an explicit version for every public installation.

The Homebrew tap will move to these same release artifacts after that first immutable release.

`install.sh --link` is exclusively for development from a local checkout. Read the [local development guide](docs/developer/local-development.md) for that path and the `ki dev local set` / `on` / `off` lifecycle.

The tracked [ki(1) manual](man/ki.1) defines the intended V1 command surface.

## Find local capabilities and documentation

`ki search <query>` searches only verified installed harness capabilities, without contacting a registry or discovering a repository.

`ki cleanup` currently reports that no eligible managed stale state exists; it does not delete cache files, links, unconfigured harnesses, or unknown files. `ki doctor` reports direct-CWD legacy `.ki-meta/` and `.ki/` directories without searching for or operating on a repository.

`ki docs` prints labelled public CLI, site, manual, and roadmap locations; `ki docs [overview|site|manual|roadmap]` prints one location. It never opens a browser or fetches content.

The [local utility commands guide](https://knowledgeislands.info/guidance/cli/local-commands/) explains their local-only behaviour and safety boundaries. The installed `ki help` and tracked manual remain authoritative for exact command grammar.

See the [roadmap](ROADMAP.md).
