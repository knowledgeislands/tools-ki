# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agentic-harness), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-arcadia-principal) remains the source of Knowledge Islands philosophy and model, and [Techne Principal](https://github.com/knowledgeislands/ki-techne-principal) translates that philosophy into engineering practice. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md) defines the six authorities and publication flows.

The active TypeScript command host provides local capability, repository, Agora, and trade operations, plus an action-first, provider-neutral `ki acquire` surface backed by verified Harness adapter declarations. The sections below describe the current public surface; use `ki --help` or the tracked [ki(1) manual](man/ki.1) for exact grammar.

## Getting started

If `ki` is not yet installed, read [install ki and run it for the first time](docs/guides/user/getting-started.md). It covers installing a signed release, creating the user environment with `ki bootstrap`, registering a repository, and verifying each step. The rest of the [user guides](docs/guides/user/README.md) carry the procedures for everything described below.

## Acquire local ChatGPT capture

Assemble a capture directory in the controlled `ki-chatgpt-capture` format, then import it into a new output directory:

```sh
ki acquire import --adapter chatgpt --capture ./capture --output ./conversation.kep
```

Use `--dry-run` to validate without creating output. The command is local only: it does not contact ChatGPT, automate a browser, read credentials, discover repositories, or extract knowledge. The capture layout, its metadata fields, and the validation failures you may hit are documented in [import a local ChatGPT capture](docs/guides/user/chatgpt-capture.md).

## Acquire Granola meetings

With the official Granola MCP configured as `granola` in `mcporter`, inspect and acquire complete selected history into the current registered repository's Harbour:

```sh
ki acquire list
ki acquire import --adapter granola --since 2023-01-01
```

Use `--repo /path/to/repository` to select another eligible receiver and `--dry-run` to perform all reads and verification without writing. Routine acquisition revalidates mutable meeting detail, reuses verified transcripts, journals interrupted work, stages one Markdown document per selected identity, and advances its receiver-local checkpoint only after complete verification. It never mutates Granola or writes another repository. Adapter activation, receiver selectors, transcript refresh, disposition, reset, and interrupted-import recovery are documented in [Acquire Granola meetings](docs/guides/user/granola-acquisition.md).

## Manage installed capabilities

`ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage verified harness payloads without activating or deactivating skills.

Use a harness identifier such as `example/harness`.

A compatible Harness declares its stable capability namespace in its root `.ki.toml`, for example `[skills.ki-repo-harness]` with `prefix = "ki"`. Every published skill uses that prefix (`ki-*`), and `ki` refuses a second installed Harness claiming it. Distinct prefixes such as `ki` and `hnr` coexist; competing Harnesses using the same prefix do not.

An immutable private GitHub harness archive may opt into the local GitHub CLI credential without placing a token in configuration, by declaring `auth = "github-cli"` alongside its commit-pinned codeload URL and SHA-256.

[Install harnesses and activate their skills](docs/guides/user/capability-lifecycle.md) covers the installation-versus-activation boundary, the user and repository activation scopes, the private-archive declaration in full, and the refusals that protect an active capability from being removed underneath it.

## Update verified installations

`ki manage update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki manage completion bash` and `ki manage completion zsh` print corresponding completion source derived from the registered CLI tree, so the completions cover every command path and valid option name without a second list to maintain.

`ki repo upgrade` refreshes the uniquely resolved providers declared by one or more selected KI repositories.

Neither command changes user or repository skill activation. [Maintain a local installation](docs/guides/user/local-installation.md) covers update ownership, shell completion, diagnosis, and repair.

## Agoras

An Agora is declared portably by a registered owner repository under `[skills.ki-agora.homes.<id>]`. Each home names its own canonical repository identity, which `ki` verifies against the local registry and includes in the resolved projection. Its other declared members reciprocate under `[skills.ki-agora.memberships.<id>]`; `ki` resolves the declaration only when every member is also locally registered and agrees with its owner and role. A home may declare `order` as a duplicate-free prefix of those canonical participant identities.

`estate` is the reserved system selector for every locally registered canonical KI repository. Use `ki agora list`, `ki agora show <id>`, and `ki agora open <id> --target zed` to inspect or open a declared Agora or the estate. Opening requires an explicit permitted target; supported local-client adapters are `zed` and `vscode`.

`ki agora audit [id]` checks declaration and reciprocal-membership health without modifying the repository estate. With no identifier it reports every declared profile; a named profile or `estate` limits the report. Exit status is `0` for healthy selections, `1` when findings are reported, and `2` for invalid or unknown explicit selectors.

`ki agora inspect <id> --target <zed|vscode> --workspace <selector>` compares one explicitly selected local editor workspace with the canonical resolved Agora. VS Code selectors are absolute physical `.code-workspace` files; Zed selectors are decimal workspace IDs resolved from the local stable or preview database. The command is read-only, reports matched, missing, extra registered, unregistered KI, and external roots, then exits `0` for an exact projection, `1` for drift or an unsupported source, and `2` for invalid selection or resolution.

`ki agora roots <id>` is the versioned machine interface for a resolved group's physical roots. A named Agora places its declared `order` prefix first and appends unlisted participants in registry-key order; an Agora without `order` and the system `estate` retain registry-key order throughout. The command writes newline-delimited absolute roots; use `--null` (or `-0`) for safe NUL-delimited path handling. It fails before writing any root when the selector cannot resolve or has no members, and it never clones, repairs, or treats source or legacy stores as Agora members.

An Agora owner may include ordinary Git repositories in its portable `references` list without making them KI members. Associate one explicit local checkout with `ki agora reference set <repository> <absolute-checkout>`, inspect associations with `ki agora reference list`, and remove one with `ki agora reference remove <repository>`. `ki` validates the checkout root and canonical `origin` identity without requiring `.ki.toml`, stores only machine-local state, and never clones or mutates the referenced repository. Unresolved references remain typed diagnostics and are omitted from projected roots without affecting reciprocal owner or member resolution. See the [Agora reference guide](docs/guides/user/agora-references.md) for setup and recovery.

## Select repository targets

Every `ki repo` operation accepts repeated `--repo <path-or-pattern>` options, one `--agora <name>` option, or `--estate` as shorthand for `--agora estate`. The three explicit selectors are mutually exclusive. Literal paths and patterns resolve to physical KI repository roots in deterministic order; an unmatched pattern, invalid root, or duplicate root stops the operation before any target runs.

`ki repo --agora <name>` selects registered owner-declared member repositories (or `estate`) and requires each selected root to remain a physical KI repository. A repeated declaration id is rejected with every declaring owner so the user can resolve the ambiguity. Without an explicit selector, `ki` reads a regular direct-CWD `.mgit.toml` schema-one manifest. Workspace manifests select their configured group, recurse through child workspaces, use structural member types for standard and nested `main/` checkouts, and skip bare stores. Repository manifests fall through to ordinary single-repository discovery. `ki` never invokes `mgit`. Selection never resolves to no repository: a selector that matches nothing fails with an actionable non-zero exit rather than completing an operation over nothing.

After target selection, operations run in target order. Read-only operations isolate a target's diagnostic; mutations retain earlier successful targets if a later target fails and return a non-zero overall result. The machine-local registry is `$XDG_STATE_HOME/ki/registry.toml`; every keyed entry holds a canonical HTTPS GitHub identity and checkout path. Use `ki registry add --repo <path-or-pattern>` to record selected canonical KI roots without applying repairs. `ki bootstrap --refresh` imports the retired configuration path list once and removes it from user configuration. A local `ki repo conform` also records each selected root first, even when its later conformance checks fail, so the registry remains an inventory for repair and bulk maintenance rather than a compliance badge.

```toml
schema = 1

[repositories."ki-agentic-harness"]
repository = "https://github.com/knowledgeislands/ki-agentic-harness"
path = "/Users/example/workspaces/knowledgeislands/ki-agentic-harness"
```

For each selected repository, `ki repo conform` collects safe write proposals and completes every initial audit before publishing any of those proposals. A failing initial audit aborts that repository's conform publication: no proposed conform write is applied. On a terminal, audit and conform use a compact receipt stream with one mutable activity row that signals activity without estimating completion.

[Audit and conform repositories](docs/guides/user/repository-operations.md) covers target selection, reading an audit result, the exact meaning of conform's `proposed write`, `applied write`, and `would apply write` verbs, what the publication boundary does not cover, the output and progress controls, and repair.

To start a KI repository, run `ki repo init` in an existing Git worktree root, or name that root as its one argument. Supply its canonical `--repository https://github.com/<owner>/<name>`, `--title`, `--description`, `--repo-code`, one or more `--runtime` values (`claude-code` or `chatgpt-codex`), and `--visibility public|private`. Initialization creates the canonical `ki-repo` declaration and registers that physical root locally; it never runs `git init`, guesses identity, activates skills, creates an Agora, or overwrites an existing declaration.

```sh
ki agora list
ki agora audit
ki agora audit estate
ki agora inspect estate --target vscode --workspace "$PWD/knowledge-islands.code-workspace"
ki agora show estate
ki agora roots estate | xargs -n 1 sh -c 'git -C "$1" status --short' _
ki agora roots estate --null | xargs -0 -n 1 sh -c 'git -C "$1" status --short' _
ki agora open estate --target zed
ki repo init --repository https://github.com/example/example --title 'Example repository' --description 'An explicit KI repository identity.' --repo-code EXAMPLE --runtime claude-code --runtime chatgpt-codex --visibility private
ki manage diag
ki repo diag
ki repo repair --dry-run
ki repo --agora estate audit
```

## Automate canonical batch records

`ki batch prepare`, `validate`, `run`, and `close` provide deterministic local file mechanics for an already-approved exact set of Ready roadmap items. The commands protect the authority payload, bind a run, append explicit item evidence, and require every named item to match the approved completion target before recording closure. They do not select or implement work, infer approval, change roadmap lifecycle, accept or prune items, push, or release.

```sh
ki batch prepare --item KI-EXAMPLE-001 --item KI-EXAMPLE-002 --approved \
  --authority-mode reviewed-items --expires-at 2099-01-01T18:00:00Z \
  --completion-target awaiting-review
ki batch validate KI-EXAMPLE-BATCH-001
ki batch run KI-EXAMPLE-BATCH-001
```

Replace the illustrative identifiers and expiry with the approved Ready items and active window for the selected repository.

See [canonical batch records](docs/guides/user/batch-records.md) for result and close examples, retained-record handling, and the process-authority boundary.

## Inspect governed work

`ki repo roadmap list --format json` emits the versioned, path-free `ki/roadmap/v1` projection with canonical record URLs for integrations.

`ki repo roadmap list` reads the canonical work-item records in selected repositories without changing them. A selected repository without its declared roadmap directory contributes no roadmap and does not make the list fail; malformed, unsafe, unreadable, or misconfigured roadmap evidence remains a diagnostic and returns status `1`.

Its default deterministic text output uses the same framed grouping style as repository audits: each repository has a header, nested horizon and lifecycle branches, its import and export trade context, diagnostics, and a compact summary. Use `--aggregate` for one selected-set inventory grouped by local horizon; item identifiers carry the repository-aligned prefix, while no-roadmap and diagnostic sections name their repositories. It is a scanning view, not a cross-repository priority queue. Unadopted `triage` intake remains visible, but generic promote and demote operations do not adopt it. Use `--horizon <value>` or `--status <value>` to filter records before rendering.

`ki repo roadmap stats` reports active count, median and maximum age and inactivity, plus a selected-set aggregate when multiple repositories are selected. Text output renders compact compound durations such as `1d 2h 3m 4s`; `--format json` retains exact numeric seconds in the versioned automation contract. `--stale-after <positive-duration>` accepts seconds, minutes, hours, or days such as `7d`.

Malformed or unsafe work items become a diagnostic for only that selected repository, while other selected repositories still report; any such diagnostic makes the command exit with status `1`.

`ki repo roadmap prune [id]` removes every canonical `done` record in the selected repository set when no ID is supplied. With an ID, it requires exactly one selected repository and removes only that named `done` record. `ki repo roadmap promote <id> [horizon]` and `ki repo roadmap demote <id> [horizon]` move one explicitly named item one horizon toward `now` or `future`, respectively; an optional destination permits a direct move only in that direction. These operations change only the canonical work-item file and preserve lifecycle status.

Creation, shaping, readiness, implementation, acceptance, and completion remain harness-process and human-authority operations. The native commands do not infer those judgments from a trade or alter a peer repository.

## Inspect cross-repository trades

`ki trade routes list` presents the current repository's declared export and import routes in a framed tree, including their registered-estate state. `ki trade routes list --estate` presents every registered repository's valid route declarations as lexical repository pairs: the left and right endpoint cells span two directional rows, with `→` and `←` showing what each side sends; an absent direction is explicit as `—`. The table adapts to the live terminal width, using the same pair model in a stacked view when it is narrow. `--incomplete` focuses either inventory on routes awaiting reciprocity or with ambiguous peers. `ki trade routes list --estate --format json` emits the versioned `ki/trade-routes/v1` contract for applications such as Knowledge Islands Observatory. It contains validated canonical identities, route evidence, resolution, and bounded map bonuses, but no registry paths, declaration paths, or presentation-derived layout weights. A route cannot be removed while a preparation, submission, or received copy still depends on it.

`ki trade prepare` creates a mutable sender-local preparation with a mandatory observation policy: `unattended`, `receipt`, `decision`, or `completion`. A receiver with the reciprocal route may use `ki trade observe` to compare the sender's committed preparation with the commit it last observed; this does not receive or act on the preparation. `ki trade submit` freezes the preparation as an outbound record, while `ki trade abandon --yes` removes an unsubmitted preparation.

`ki trade receive <trade-id>` imports one committed submission and records its source commit. `ki trade receive --all` previews every receivable trade and changes nothing until `--yes` is also supplied. Receiver-owned decision evidence remains local; the sender-owned envelope and body are immutable.

`ki trade subtypes` maintains receiver-owned knowledge subtype definitions. `ki trade standing` adds, lists, checks, and removes exact reciprocal standing grants layered on active ordinary knowledge routes. From the receiver, `ki trade standing capture` appends a marked, commit-pinned `STI-*` provenance block to an existing local Markdown file only after the source commit and path resolve and the exact grant is active. One-sided, unknown, malformed, ambiguous, or revoked declarations retain the ordinary itemized-trade fallback and grant no direct-capture authority. See the [standing knowledge-intake guide](docs/guides/user/standing-knowledge-intake.md) for the complete workflow.

`ki trade list` presents visible preparations, imports, and exports across the registered repository estate. Each item identifies its peer (`→ receiver` or `← sender`), kind (`⚒` work or `ⓘ` knowledge), observation policy, and lifecycle: preparing or submitted, receipt state, receiver decision, and release or prune eligibility. Sender release becomes eligible according to the selected observation policy; receiver prune becomes eligible only after that release is observable. `ki trade release --eligible` and `ki trade prune --eligible` preview their batches and require `--yes` to apply them. These trade and the existing report and diagnostic symbols come from one bounded presentation registry; structural tree and table characters remain part of their renderers.

`ki repo roadmap list` includes that record context for each selected repository, so planning work and incoming or outgoing trades can be scanned together without changing either lifecycle. If the local registered trade estate cannot be read, it reports that context as unavailable and exits with status `1` after rendering the inventory.

## Install MCP source releases

Install a governed MCP server source from an exact annotated release, or omit the version to select its latest stable GitHub Release:

```sh
ki manage mcp install owner/repository 1.2.3
ki manage mcp install owner/repository
ki manage mcp list owner/repository
```

Use explicit `--auth github-cli` for private repositories. KI verifies and builds the release into a versioned local installation, records path-free provenance, and atomically activates it. Updates retain complete prior versions for offline rollback; uninstall removes the source installation. Client binding remains a separate operation. See [the local installation guide](docs/guides/user/local-installation.md) for authentication, update, rollback, and recovery details.

## Install

After the first immutable release, download `install.sh` from an exact released tag, inspect it, then run it with that tag:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' --output install.sh \
  https://raw.githubusercontent.com/knowledgeislands/tools-ki/vX.Y.Z/install.sh
bash ./install.sh vX.Y.Z
```

The installer carries the pinned public key and verifies the release's Ed25519-signed checksum manifest before downloading the platform archive. It supports macOS (Apple Silicon and Intel) and x86_64 glibc Linux. Use an explicit version for every public installation. The equivalent pinned pipe form is `curl -fsSL https://knowledgeislands.info/install/ki | sh -s -- vX.Y.Z`; omitting the version deliberately resolves the latest release.

The Homebrew tap will move to these same release artifacts after that first immutable release.

[Install ki and run it for the first time](docs/guides/user/getting-started.md) takes this further: what `ki bootstrap` does, how to register the first repository, and how to verify and recover from each step.

`install.sh --link` is exclusively for development from a local checkout. Read the [local development guide](docs/guides/developer/local-development.md) for that path and the `ki dev local set <harness-id> <path>` / `on [harness-id]` / `off [harness-id]` lifecycle. Each installed Harness can have an independent local source; omitting the ID from `on` or `off` applies the transition to all configured sources.

The tracked [ki(1) manual](man/ki.1) defines the intended V1 command surface.

## Documentation map

- [Decision Records](docs/decisions/README.md) explain why the platform is shaped as it is.
- [Specifications](docs/specs/index.md) define the accepted observable behaviour and its verification evidence.
- [Guides](docs/guides/README.md) explain how to operate, develop, and release `ki`, routed by audience: [user guides](docs/guides/user/README.md) and [developer guides](docs/guides/developer/README.md).
- [Roadmap](ROADMAP.md) shows active delivery work and its lifecycle state.
- [Changelog](CHANGELOG.md) inventories the public V1 baseline while pre-V1 tags remain the shipped `0.x` release record.

## Find local capabilities and documentation

`ki manage search <query>` searches only verified installed harness capabilities, without contacting a registry or discovering a repository.

`ki manage vscode check` compares a chezmoi-managed VS Code workspace inventory and trusted-folder source with the local KI registry. Use `ki manage vscode sync --write` to publish reviewed source-state repairs, or `ki manage vscode source create <repository> --write` to create and associate an opt-in OneDrive source store. These commands update only chezmoi source state and never run `chezmoi apply`; see the [VS Code projection management guide](docs/guides/user/vscode-management.md).

`ki manage diag` reports machine-managed installation, configuration, registry, and path state, and `ki manage doctor` checks that state and reports direct-CWD legacy `.ki-meta/` and `.ki/` directories. `ki manage repair` reconciles missing, dangling, or stale configured user-skill projections, and `ki repo repair` does the equivalent for a selected repository's KI-managed projections; `--dry-run` changes nothing in either. `ki manage docs` prints labelled public CLI, site, manual, and roadmap locations without opening a browser.

[Maintain a local installation](docs/guides/user/local-installation.md) explains the local-only behaviour and safety boundary of each of these, including which of them only ever report. Use `ki --help` or `ki <command> --help` for exact grammar; the tracked manual remains authoritative.
