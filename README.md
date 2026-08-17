# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agentic-harness), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-arcadia-principal) remains the source of Knowledge Islands philosophy and model, and [Techne Principal](https://github.com/knowledgeislands/ki-techne-principal) translates that philosophy into engineering practice. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md) defines the six authorities and publication flows.

The active TypeScript command host provides local capability, repository, Agora, and trade operations, plus a user-assisted `ki acquire chatgpt import` command that produces a Knowledge Export Package (KEP). The sections below describe the current public surface; use `ki --help` or the tracked [ki(1) manual](man/ki.1) for exact grammar.

## Acquire a local ChatGPT capture

Prepare a capture using the [controlled local-capture format](https://knowledgeislands.info/guidance/cli/chatgpt-local-capture/), then import it into a new output directory:

```sh
ki acquire chatgpt import ./capture --output ./conversation.kep
```

Use `--dry-run` to validate without creating output. The command is local only: it does not contact ChatGPT, automate a browser, read credentials, discover a repository, or extract knowledge.

## Manage installed capabilities

`ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage verified harness payloads without activating or deactivating skills.

Use a harness identifier such as `example/harness`.

### Private GitHub harnesses

An immutable private GitHub harness archive may opt into the local GitHub CLI credential without placing a token in configuration. Use the commit-pinned codeload URL, record its SHA-256, and declare `auth = "github-cli"`:

```toml
[[harnesses.releases]]
id = "example/private-harness"
url = "https://codeload.github.com/example/private-harness/tar.gz/<commit-sha>"
sha256 = "<archive-sha256>"
auth = "github-cli"
```

`ki` runs `gh auth token` only for that exact codeload URL, sends the returned token only as its HTTPS authorization header, follows no redirects, and never records or displays the token. Authenticate the GitHub CLI first with `gh auth login`. Public archive releases need no `auth` field and do not invoke `gh`.

For the installation and activation boundary, read the [capability lifecycle guide](https://knowledgeislands.info/guidance/cli/capability-lifecycle/).

## Update verified installations

`ki manage update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki manage completion bash` and `ki manage completion zsh` print corresponding completion source derived from the registered CLI tree. Bash and Zsh cover every command path and valid option name; closed values complete locally, path-bearing repository selectors, capture directories, and output directories delegate to the shell, and opaque identifiers remain user-entered.

`ki repo upgrade` refreshes the uniquely resolved providers declared by one or more selected KI repositories.

Neither command changes user or repository skill activation; read the [update and upgrade guide](https://knowledgeislands.info/guidance/cli/update-upgrade/) for target selection and ownership boundaries.

## Agoras

An Agora is declared portably by a registered owner repository under `[skills.ki-agora.homes.<id>]`. Each home names its own canonical repository identity, which `ki` verifies against the local registry and includes in the resolved projection. Its other declared members reciprocate under `[skills.ki-agora.memberships.<id>]`; `ki` resolves the declaration only when every member is also locally registered and agrees with its owner and role.

`estate` is the reserved system selector for every locally registered canonical KI repository. Use `ki agora list`, `ki agora show <id>`, and `ki agora open <id> --target zed` to inspect or open a declared Agora or the estate. Opening requires an explicit permitted target; it currently supports the portable `zed-workspace` policy through Zed.

`ki agora roots <id>` is the versioned machine interface for a resolved group's physical roots. It writes newline-delimited absolute roots in deterministic registry-key order; use `--null` (or `-0`) for safe NUL-delimited path handling. It fails before writing any root when the selector cannot resolve or has no members, and it never clones, repairs, or treats source or legacy stores as Agora members.

## Select repository targets

Every `ki repo` operation accepts repeated `--repo <path-or-pattern>` options or one `--agora <name>` option. The two explicit selectors are mutually exclusive. Literal paths and patterns resolve to physical KI repository roots in deterministic order; an unmatched pattern, invalid root, or duplicate root stops the operation before any target runs.

`ki repo --agora <name>` selects the registered owner and declared member repositories (or `estate`) and requires each selected root to remain a physical KI repository. A repeated declaration id is rejected with every declaring owner so the user can resolve the ambiguity. Without an explicit selector, `ki` reads a regular direct-CWD `.mgit-config.toml` and follows its `members` table through standard repositories, nested `main/` checkouts, and `dir` containers. It ignores mGit `symlinks` and bare stores, and never invokes `mgit`. A document that names no member repositories describes the repository it sits in rather than a workspace, so `ki` falls back to single-repository discovery from the working directory — as it does when there is no direct-CWD configuration at all. Selection never resolves to no repository: a selector that matches nothing fails with a message and a non-zero exit rather than completing an operation over nothing.

After target selection, operations run in target order. Read-only operations isolate a target's diagnostic; mutations retain earlier successful targets if a later target fails and return a non-zero overall result. The machine-local registry is `$XDG_STATE_HOME/ki/registry.toml`; every keyed entry holds a canonical HTTPS GitHub identity and checkout path. Use `ki registry add --repo <path-or-pattern>` to record selected canonical KI roots without applying repairs. `ki bootstrap --refresh` imports the retired configuration path list once and removes it from user configuration. A local `ki repo conform` also records each selected root first, even when its later conformance checks fail, so the registry remains an inventory for repair and bulk maintenance rather than a compliance badge.

```toml
schema = 1

[repositories."ki-agentic-harness"]
repository = "https://github.com/knowledgeislands/ki-agentic-harness"
path = "/Users/example/workspaces/knowledgeislands/ki-agentic-harness"
```

For each selected repository, `ki repo conform` collects safe write proposals and completes every initial audit before publishing any of those proposals. A failing initial audit aborts that repository's conform publication: no proposed conform write is applied. Its output says `proposed write` while the set is staged and `applied write` only after publication; `--dry-run` validates the staged set and then says `would apply write`, without mutation. This boundary does not include the independent local registry update above, later selected repositories, subprocess conforms, or rollback after publication has started.

Conform labels its second rubric pass `re-audit`, because it repeats the audit after staged writes or commands land. When nothing is staged, it reports that no re-audit is required and stops after the initial pass.

On a terminal, audit and conform use a compact receipt stream with one mutable activity row. The moving bar means work is active; it does not estimate completion from item count or declared cost. Evidence-ready skills appear once with a full bar, then collapse to one timed evidence receipt before the rubric results begin. Loading and the operation also finish as timed receipts, with total elapsed time on the operation receipt. Queued skills are not printed. `--progress-style single` suppresses the temporary per-skill evidence receipts, and redirected `--progress always` defaults to that single-row form. All-pass runs end at the summary; detailed per-skill result rows appear only for WARN, FAIL, or FIXED outcomes.

To start a KI repository, run `ki repo init` in an existing Git worktree root, or name that root as its one argument. Supply its canonical `--repository https://github.com/<owner>/<name>`, `--title`, `--description`, `--repo-code`, one or more `--runtime` values (`claude-code` or `chatgpt-codex`), and `--visibility public|private`. Initialization creates the canonical `ki-repo` declaration and registers that physical root locally; it never runs `git init`, guesses identity, activates skills, creates an Agora, or overwrites an existing declaration.

```sh
ki agora list
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

## Inspect governed work

`ki repo roadmap list` reads the canonical work-item records in selected repositories without changing them.

Its deterministic text output uses the same framed grouping style as repository audits: each repository has a header, nested horizon and lifecycle branches, its import and export trade context, diagnostics, and a compact summary. Use `--horizon <value>` or `--status <value>` to filter records before rendering.

Malformed or unsafe work items become a diagnostic for only that selected repository, while other selected repositories still report; any such diagnostic makes the command exit with status `1`.

`ki repo roadmap prune [id]` removes every canonical `done` record in the selected repository set when no ID is supplied. With an ID, it requires exactly one selected repository and removes only that named `done` record. `ki repo roadmap promote <id> [horizon]` and `ki repo roadmap demote <id> [horizon]` move one explicitly named item one horizon toward `now` or `future`, respectively; an optional destination permits a direct move only in that direction. These operations change only the canonical work-item file and preserve lifecycle status.

Creation, shaping, readiness, implementation, acceptance, and completion remain harness-process and human-authority operations. The native commands do not infer those judgments from a trade or alter a peer repository.

## Inspect cross-repository trades

`ki trade routes list` presents the current repository's declared export and import routes in a framed tree, including their registered-estate state. `ki trade routes list --estate` presents every registered repository's valid route declarations as lexical repository pairs: the left and right endpoint cells span two directional rows, with `→` and `←` showing what each side sends; an absent direction is explicit as `—`. The table adapts to the live terminal width, using the same pair model in a stacked view when it is narrow. `--table` explicitly selects this estate text renderer, while `--incomplete` focuses it on routes awaiting reciprocity or with ambiguous peers. `ki trade routes list --estate --html` renders the same estate as an interactive force-directed network, writes it to the cache, and opens it; it cannot be combined with `--table`. The page carries the estate as data and lets the simulation arrange it, so a reader who disagrees with the arrangement drags a repository rather than waiting for a better layout. It draws one arc per direction — a reciprocated pair separates rather than collapsing to a double-headed line, so a pair that reciprocates one trade kind but not the other stays legible — with accessible, vendored Lucide Hammer and Book Open chips naming the kinds travelling each arc and an unreciprocated route dashed. Active typed directions determine each lane's capacity, target distance, spring, and width; node influence combines active route degree, a derived `knowledgeislands/*` organisation uplift, and an optional repository-declared `map_bonus` under `[skills.ki-trades]`. The generated hover details expose those contributions. Presentation weights do not grant route, acceptance, or lifecycle authority. The page includes no icon-font or network dependency. A route cannot be removed while a preparation, submission, or received copy still depends on it.

`ki trade prepare` creates a mutable sender-local preparation with a mandatory observation policy: `unattended`, `receipt`, `decision`, or `completion`. A receiver with the reciprocal route may use `ki trade observe` to compare the sender's committed preparation with the commit it last observed; this does not receive or act on the preparation. `ki trade submit` freezes the preparation as an outbound record, while `ki trade abandon --yes` removes an unsubmitted preparation.

`ki trade receive <trade-id>` imports one committed submission and records its source commit. `ki trade receive --all` previews every receivable trade and changes nothing until `--yes` is also supplied. Receiver-owned decision evidence remains local; the sender-owned envelope and body are immutable.

`ki trade list` presents visible preparations, imports, and exports across the registered repository estate. Each item identifies its peer (`→ receiver` or `← sender`), kind (`⚒` work or `ⓘ` knowledge), observation policy, and lifecycle: preparing or submitted, receipt state, receiver decision, and release or prune eligibility. Sender release becomes eligible according to the selected observation policy; receiver prune becomes eligible only after that release is observable. `ki trade release --eligible` and `ki trade prune --eligible` preview their batches and require `--yes` to apply them. These trade and the existing report and diagnostic symbols come from one bounded presentation registry; structural tree and table characters remain part of their renderers.

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

`install.sh --link` is exclusively for development from a local checkout. Read the [local development guide](docs/guides/developer/local-development.md) for that path and the `ki dev local set <harness-id> <path>` / `on` / `off` lifecycle, which can temporarily substitute any Harness already present in the installed estate.

The tracked [ki(1) manual](man/ki.1) defines the intended V1 command surface.

## Find local capabilities and documentation

`ki manage search <query>` searches only verified installed harness capabilities, without contacting a registry or discovering a repository.

`ki manage cleanup` currently reports that no eligible managed stale state exists; it does not delete cache files, links, unconfigured harnesses, or unknown files. `ki manage diag` reports only machine-managed installation, configuration, registry, and path state. `ki repo diag` uses the standard repository discovery, `--repo`, or `--agora` selection rules to report each selected repository's declared skills and compatible local projections without changing state. `ki manage repair` reconciles missing, dangling, or stale configured user-skill projections; `--dry-run` changes nothing and unavailable or unsafe state remains reported for manual resolution. `ki repo repair` records each selected physical root before repairing only missing, dangling, or stale KI-managed projections, and `--dry-run` changes nothing. `ki manage doctor` reports direct-CWD legacy `.ki-meta/` and `.ki/` directories and validates a regular direct-CWD `.ki-config.toml`.

`ki manage docs` prints labelled public CLI, site, manual, and roadmap locations; `ki manage docs [overview|site|manual|roadmap]` prints one location. It never opens a browser or fetches content.

The [local utility commands guide](https://knowledgeislands.info/guidance/cli/local-commands/) explains their local-only behaviour and safety boundaries. Use `ki --help` or `ki <command> --help` for exact grammar; the tracked manual remains authoritative.

See the [roadmap](ROADMAP.md).
