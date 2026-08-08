# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agentic-harness), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-arcadia-principal) remains the source of Knowledge Islands philosophy and model, and [Techne Principal](https://github.com/knowledgeislands/ki-techne-principal) translates that philosophy into engineering practice. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md) defines the six authorities and publication flows.

The seed delivery established the `ki` command channel. The active TypeScript command host provides help, `--version`, XDG inspection, and a user-assisted `ki acquire chatgpt import` command that produces a Knowledge Export Package (KEP).

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

`ki manage update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki manage completion bash` and `ki manage completion zsh` print corresponding completion source derived from the registered CLI tree. Bash and Zsh cover every command path and valid option name; closed values complete locally, path-bearing repository selectors, capture directories, and output directories delegate to the shell, and opaque identifiers remain user-entered.

`ki repo upgrade` refreshes the uniquely resolved providers declared by one or more selected KI repositories.

Neither command changes user or repository skill activation; read the [update and upgrade guide](https://knowledgeislands.info/guidance/cli/update-upgrade/) for target selection and ownership boundaries.

## Agora profiles

Named Agora profiles live at `$XDG_CONFIG_HOME/ki/agoras/<name>.ki-agora` (normally `~/.config/ki/agoras`).

Use `ki agora list`, `ki agora show <name>`, and `ki agora open <name>` to inspect or open a profile's project-name ordered Zed roster.

## Select repository targets

Every `ki repo` operation accepts repeated `--repo <path-or-pattern>` options or one `--agora <name>` option. The two explicit selectors are mutually exclusive. Literal paths and patterns resolve to physical KI repository roots in deterministic order; an unmatched pattern, invalid root, or duplicate root stops the operation before any target runs.

An Agora is a named user-level collection of physical projects stored at `$XDG_CONFIG_HOME/ki/agoras/<name>.ki-agora`. Use `ki agora create <name>` to create one, `ki agora add <name> <directory>` to add a project, and `ki agora discover <name> <directory>` to add every KI repository discovered below a physical directory. `ki agora remove <name> <project>` removes a project by its profile name, while `list`, `show`, and `open` inspect or open a profile.

`ki repo --agora <name>` selects the profile's projects and requires each selected project to be a physical KI repository. Without an explicit selector, `ki` reads a regular direct-CWD `.mgit-config.toml` and follows its `members` table through standard repositories, nested `main/` checkouts, and `dir` containers. It ignores mGit `symlinks` and bare stores, and never invokes `mgit`. Without a direct-CWD configuration, it retains single-repository discovery from the working directory.

After target selection, operations run in target order. Read-only operations isolate a target's diagnostic; mutations retain earlier successful targets if a later target fails and return a non-zero overall result. Use `ki registry add --repo <path-or-pattern>` to add selected physical KI roots to the local user registry without applying repairs. A local `ki repo conform` also records each selected root first, even when its declaration or later conformance checks fail, so the registry remains an inventory for repair and bulk maintenance rather than a compliance badge.

For each selected repository, `ki repo conform` collects safe write proposals and completes every initial audit before publishing any of those proposals. A failing initial audit aborts that repository's conform publication: no proposed conform write is applied. Its output says `proposed write` while the set is staged and `applied write` only after publication; `--dry-run` validates the staged set and then says `would apply write`, without mutation. This boundary does not include the independent local registry update above, later selected repositories, subprocess conforms, or rollback after publication has started.

To start a KI repository, run `ki repo init` in an existing Git worktree root, or name that root as its one argument. Supply `--title`, `--description`, `--repo-code`, one or more `--runtime` values (`claude-code` or `chatgpt-codex`), and `--visibility public|private`. Initialization creates only the canonical `ki-repo` declaration and registers that physical root locally; it never runs `git init`, guesses identity, activates skills, creates an Agora, or overwrites an existing declaration.

```sh
ki agora create inventory
ki agora discover inventory ./repos
ki agora list
ki repo init --title 'Example repository' --description 'An explicit KI repository identity.' --repo-code EXAMPLE --runtime claude-code --runtime chatgpt-codex --visibility private
ki manage diag
ki repo repair --dry-run
ki repo --agora inventory audit
```

## Inspect governed work

`ki repo roadmap list` reads the canonical work-item records in selected repositories without changing them.

Its deterministic text output uses the same framed grouping style as repository audits: each repository has a header, nested horizon and lifecycle branches, its import and export trade context, diagnostics, and a compact summary. Use `--horizon <value>` or `--status <value>` to filter records before rendering.

Malformed or unsafe work items become a diagnostic for only that selected repository, while other selected repositories still report; any such diagnostic makes the command exit with status `1`.

`ki repo roadmap prune [id]` removes every canonical `done` record in the selected repository set when no ID is supplied. With an ID, it requires exactly one selected repository and removes only that named `done` record. `ki repo roadmap promote <id> [horizon]` and `ki repo roadmap demote <id> [horizon]` move one explicitly named item one horizon toward `now` or `future`, respectively; an optional destination permits a direct move only in that direction. These operations change only the canonical work-item file and preserve lifecycle status.

Creation, shaping, readiness, implementation, acceptance, and completion remain harness-process and human-authority operations. The native commands do not infer those judgments from a trade or alter a peer repository.

## Inspect cross-repository trades

`ki trade routes list` presents the current repository's declared export and import routes in a framed tree, including their registered-estate state. `ki trade routes list --estate` presents every registered repository's valid route declarations as one estate; add `--incomplete` to focus on routes awaiting reciprocity or with ambiguous peers. `ki trade routes list --estate --svg` renders the same estate as a self-contained SVG diagram — to standard output, or to a file when given a path — drawing one edge per direction — a reciprocated pair runs side by side rather than collapsing to a double-headed line, so a pair that reciprocates one trade kind and not the other stays legible. Icons riding each edge name the kinds travelling it, and an unreciprocated route is dashed. A route cannot be removed while a preparation, submission, or received copy still depends on it.

`ki trade prepare` creates a mutable sender-local preparation with a mandatory observation policy: `unattended`, `receipt`, `decision`, or `completion`. A receiver with the reciprocal route may use `ki trade observe` to compare the sender's committed preparation with the commit it last observed; this does not receive or act on the preparation. `ki trade submit` freezes the preparation as an outbound record, while `ki trade abandon --yes` removes an unsubmitted preparation.

`ki trade receive <trade-id>` imports one committed submission and records its source commit. `ki trade receive --all` previews every receivable trade and changes nothing until `--yes` is also supplied. Receiver-owned decision evidence remains local; the sender-owned envelope and body are immutable.

`ki trade list` presents visible preparations, imports, and exports across the registered repository estate. Each item identifies its peer (`→ receiver` or `← sender`), kind (`⚒` work or `◇` knowledge), observation policy, and lifecycle: preparing or submitted, receipt state, receiver decision, and release or prune eligibility. Sender release becomes eligible according to the selected observation policy; receiver prune becomes eligible only after that release is observable. `ki trade release --eligible` and `ki trade prune --eligible` preview their batches and require `--yes` to apply them.

`ki repo roadmap list` includes that record context for each selected repository, so planning work and incoming or outgoing trades can be scanned together without changing either lifecycle. If the local registered trade estate cannot be read, it reports that context as unavailable and exits with status `1` after rendering the inventory.

## Install

After the first immutable release, download `install.sh` from an exact released tag, inspect it, then run it with that tag:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' --output install.sh \
  https://raw.githubusercontent.com/knowledgeislands/tools-ki/vX.Y.Z/install.sh
bash ./install.sh vX.Y.Z
```

The installer carries the pinned public key and verifies the release's Ed25519-signed checksum manifest before downloading the platform archive. It supports macOS (Apple Silicon and Intel) and x86_64 glibc Linux. Use an explicit version for every public installation.

The Homebrew tap will move to these same release artifacts after that first immutable release.

`install.sh --link` is exclusively for development from a local checkout. Read the [local development guide](docs/guides/developer/local-development.md) for that path and the `ki dev local set` / `on` / `off` lifecycle.

The tracked [ki(1) manual](man/ki.1) defines the intended V1 command surface.

## Find local capabilities and documentation

`ki manage search <query>` searches only verified installed harness capabilities, without contacting a registry or discovering a repository.

`ki manage cleanup` currently reports that no eligible managed stale state exists; it does not delete cache files, links, unconfigured harnesses, or unknown files. `ki manage diag` always reports global KI state and, only for a regular `.ki-config.toml` in the current directory itself, also reports declared repository skills and compatible local projections. `ki manage repair` reconciles missing, dangling, or stale configured user-skill projections; `--dry-run` changes nothing and unavailable or unsafe state remains reported for manual resolution. `ki repo repair` uses the standard repository discovery, `--repo`, or `--agora` selection rules; it records each selected physical root before repairing only missing, dangling, or stale KI-managed projections, and `--dry-run` changes nothing. `ki manage doctor` reports direct-CWD legacy `.ki-meta/` and `.ki/` directories and validates a regular direct-CWD `.ki-config.toml`.

`ki manage docs` prints labelled public CLI, site, manual, and roadmap locations; `ki manage docs [overview|site|manual|roadmap]` prints one location. It never opens a browser or fetches content.

The [local utility commands guide](https://knowledgeislands.info/guidance/cli/local-commands/) explains their local-only behaviour and safety boundaries. Use `ki --help` or `ki <command> --help` for exact grammar; the tracked manual remains authoritative.

See the [roadmap](ROADMAP.md).
