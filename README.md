# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

Optional `ki kb index`, `ki kb search` and `ki kb status` operate one explicitly assigned registered Knowledge Base through a private derived qmd generation. [Search one Knowledge Base](docs/guides/user/kb-search.md) explains model provisioning, isolated state, operator daemon bindings and source-authenticated citations.

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agentic-harness), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-arcadia-principal) remains the source of Knowledge Islands philosophy and model, and its [Engineering Practice](https://github.com/knowledgeislands/ki-arcadia-principal/blob/main/Pillars/Engineering%20Practice/Engineering%20Practice.md) translates that philosophy into engineering practice. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md) defines the six authorities and publication flows.

The active TypeScript command host provides local capability, repository, Agora, and trade operations, plus an action-first, provider-neutral `ki acquire` surface backed by verified Harness adapter declarations. The sections below describe the current public surface; use `ki --help` or the tracked [ki(1) manual](man/ki.1) for exact grammar.

## Getting started

If `ki` is not yet installed, read [install ki and run it for the first time](docs/guides/user/getting-started.md). It covers installing a signed release, creating the user environment with `ki bootstrap`, registering a repository, and verifying each step. The rest of the [user guides](docs/guides/user/README.md) carry the procedures for everything described below.

Once installed, run `ki -h` for an alphabetical command list, then `ki <command> -h` for the selected command's options. The manual groups commands by purpose. `ki docs` locates the fuller references.

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

Use `--repo /path/to/repository` to select another eligible receiver and `--dry-run` to perform all reads and verification without writing. Routine acquisition revalidates mutable meeting detail, reuses verified transcripts, journals interrupted work, stages one Markdown document per selected identity, and advances its receiver-local checkpoint only after complete verification. Desktop screenshots use the separate `ki acquire images` handoff because Granola MCP omits attachments. It never mutates Granola or writes another repository. Adapter activation, receiver selectors, screenshot export, transcript refresh, disposition, reset, and interrupted-import recovery are documented in [Acquire Granola meetings](docs/guides/user/granola-acquisition.md).

## Manage installed capabilities

`ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage verified harness payloads without activating or deactivating skills.

Use a harness identifier such as `example/harness`.

A compatible Harness declares its stable capability namespace in its root `.ki.toml`, for example `[skills.ki-repo-harness]` with `prefix = "ki"`. Every published skill uses that prefix (`ki-*`), and `ki` refuses a second installed Harness claiming it. Distinct prefixes such as `ki` and `hnr` coexist; competing Harnesses using the same prefix do not.

An immutable private GitHub harness archive may opt into the local GitHub CLI credential without placing a token in configuration, by declaring `auth = "github-cli"` alongside its commit-pinned codeload URL and SHA-256.

[Install harnesses and activate their skills](docs/guides/user/capability-lifecycle.md) covers the installation-versus-activation boundary, the user and repository activation scopes, the private-archive declaration in full, and the refusals that protect an active capability from being removed underneath it.

## Update verified installations

`ki update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki completion bash` and `ki completion zsh` print corresponding completion source derived from the registered CLI tree, so the completions cover every command path and valid option name without a second list to maintain.

`ki repo upgrade` refreshes the uniquely resolved providers declared by one or more selected KI repositories.

Neither command changes user or repository skill activation. [Maintain a local installation](docs/guides/user/local-installation.md) covers update ownership, shell completion, diagnosis, and repair.

## Agoras

An Agora is declared by one registered owner under `[skills.ki-agora.<id>]` with a required single-line `title` shown to people; the identifier remains the only selector and machine key. The owner comes from its `ki-repo.repository` identity and lists direct members by canonical repository identity. Member repositories need no Agora configuration. An optional `includes` list adds another Agora's owner and direct members, or one repository by its canonical URL, to the working set without granting membership. `ki` deduplicates and sorts resolved roots alphabetically by local registry key.

`estate` is the reserved system selector for every locally registered canonical KI repository. Use `ki agora list`, `ki agora show <id>`, and `ki agora open <id> --target zed` to inspect or open a declared Agora or the estate. Opening requires an explicit permitted target; supported local-client adapters are `zed`, `vscode`, and `delta`. Delta opens each repository in its running app, where you can organise threads yourself. For a named Agora, the Zed sidebar puts its owner first; other roots retain registry-key order.

Delta accepts Git repository roots only, so `ki repo open --target delta` skips local Knowledge Base stores and rejects `--stores`. Delta's documented project flow stores repository files, Git history, and thread data on its servers even when you use a local model; choose this target only for repositories you intend to add to Delta. See [Delta's data storage documentation](https://delta.dev/docs/privacy-and-security/data-storage).

`ki agora audit [id]` checks owner declarations and resolved working-set health without modifying the repository estate. With no identifier it reports every declared profile; a named profile or `estate` limits the report. Exit status is `0` for healthy selections, `1` when findings are reported, and `2` for invalid or unknown explicit selectors.

`ki agora inspect <id> --target <zed|vscode> --workspace <selector>` compares one explicitly selected local editor workspace with the canonical resolved Agora. VS Code selectors are absolute physical `.code-workspace` files; Zed selectors are decimal workspace IDs resolved from the local stable or preview database. The command is read-only, reports matched, missing, extra registered, unregistered KI, and external roots, then exits `0` for an exact projection, `1` for drift or an unsupported source, and `2` for invalid selection or resolution.

`ki agora roots <id>` is the versioned machine interface for a resolved group's physical roots. Named Agoras and the system `estate` use registry-key order throughout. The command writes newline-delimited absolute roots; use `--null` (or `-0`) for safe NUL-delimited path handling. It fails before writing any root when the selector cannot resolve or has no members, and it never clones, repairs, or treats source or legacy stores as Agora members.

An Agora owner may include a canonical repository URL in `includes` without making it a member. Registered repositories resolve through the local registry. For an unregistered Git repository, associate one explicit local checkout with `ki agora reference set <repository> <absolute-checkout>`, inspect associations with `ki agora reference list`, and remove one with `ki agora reference remove <repository>`. `ki` validates the checkout root and canonical `origin` identity without requiring `.ki.toml`, stores only machine-local state, and never clones or mutates the included repository. Unresolved external inclusions remain typed diagnostics and are omitted from projected roots without affecting direct members. See the [Agora reference guide](docs/guides/user/agora-references.md) for setup and recovery.

## Select repository targets

Every `ki repo` operation accepts repeated `--repo <path-or-pattern>` options, one `--agora <name>` option, or `--estate` as shorthand for `--agora estate`. The three explicit selectors are mutually exclusive. Literal paths and patterns resolve to physical KI repository roots in deterministic order; an unmatched pattern, invalid root, or duplicate root stops the operation before any target runs.

`ki repo --agora <name>` selects registered owner-declared member repositories (or `estate`) and requires each selected root to remain a physical KI repository. A repeated declaration id is rejected with every declaring owner so the user can resolve the ambiguity. Without an explicit selector, `ki` reads a regular direct-CWD `.mgit.toml` manifest. Unversioned workspace manifests select direct members; existing `schema = 1` manifests select their configured group. Both recurse through child workspaces, use member types for standard and nested `main/` checkouts, and skip bare stores. Repository manifests fall through to ordinary single-repository discovery. `ki` never invokes `mgit`. Selection never resolves to no repository: a selector that matches nothing fails with an actionable non-zero exit rather than completing an operation over nothing.

Existing physical mGit members without `.ki.toml` are skipped; `ki repo audit` names them in normal and concise output. Missing or unsafe checkouts, unsafe or invalid KI declarations, and a selection with no KI repositories fail.

After target selection, operations run in target order. Read-only operations isolate a target's diagnostic; mutations retain earlier successful targets if a later target fails and return a non-zero overall result. The machine-local registry is `$XDG_STATE_HOME/ki/registry.toml`; every keyed entry holds a canonical HTTPS GitHub identity and checkout path. Use `ki registry add --repo <path-or-pattern>` to record selected canonical KI roots without applying repairs. `ki repo store scan` reports conventional OneDrive source directories for selected repositories that lack a declared `sources` role; use `ki repo --estate store scan` to check every registered repository. It only warns and leaves every store untouched. `ki bootstrap --refresh` imports the retired configuration path list once and removes it from user configuration. A local `ki repo conform` also records each selected root first, even when its later conformance checks fail, so the registry remains an inventory for repair and bulk maintenance rather than a compliance badge.

```toml
schema = 1

[repositories."ki-agentic-harness"]
repository = "https://github.com/knowledgeislands/ki-agentic-harness"
path = "/Users/example/workspaces/knowledgeislands/ki-agentic-harness"
```

For each selected repository, `ki repo conform` collects safe write proposals and completes every initial audit before publishing any of those proposals. A failing initial audit aborts that repository's conform publication: no proposed conform write is applied. On a terminal, audit and conform use a compact receipt stream with one mutable activity row that signals activity without estimating completion.

[Audit and conform repositories](docs/guides/user/repository-operations.md) covers target selection, reading an audit result, the exact meaning of conform's `proposed write`, `applied write`, and `would apply write` verbs, what the publication boundary does not cover, the output and progress controls, and repair.

To start a KI repository, run `ki repo init` in an existing Git worktree root, or name that root as its one argument. Supply its canonical `--repository https://github.com/<owner>/<name>`, its territory Capital as `--capital https://github.com/<owner>/<name>` (the repository itself when it is a Capital), `--title`, `--description`, `--repo-code`, one or more `--runtime` values (`claude-code` or `chatgpt-codex`), and `--visibility public|private`. Initialization declares a Project with `repo_type = "project"`, `primary_shape = "ki-repo-project"`, and the baseline shape skill, then registers that physical root locally; it never runs `git init`, guesses identity, activates skills, creates an Agora, or overwrites an existing declaration.

Every `[skills.ki-repo]` declaration requires an explicit `repo_type` and `primary_shape`. The shape must name a declared core Project shape, or `ki-repo-kb` when `repo_type = "kb"`. Specialist and refining skills remain composable; their presence does not choose or change the primary shape. The `ki-repo` skill owns the allowed shapes and compatibility rules.

```sh
ki agora list
ki agora audit
ki agora audit estate
ki agora inspect estate --target vscode --workspace "$PWD/knowledge-islands.code-workspace"
ki agora show estate
ki agora roots estate | xargs -n 1 sh -c 'git -C "$1" status --short' _
ki agora roots estate --null | xargs -0 -n 1 sh -c 'git -C "$1" status --short' _
ki agora open estate --target zed
ki repo init --repository https://github.com/example/example --capital https://github.com/example/example --title 'Example repository' --description 'An explicit KI repository identity.' --repo-code EXAMPLE --runtime claude-code --runtime chatgpt-codex --visibility private
ki diag
ki repo diag
ki repo repair --dry-run
ki repo --agora estate audit
```

## Delegate to background agents

`ki agent` launches detached Claude Code or Codex agents under the `ki-delegation` background-run contract. Each agent gets a prompt with its authority footer and progress protocol, a one-line status ending `DONE`, a pid, a log and a report under `$KI_STATE_HOME/agents/<run>/`. A queue and a concurrency-capped dispatcher keep agents moving, and `ki agent wait --next` wakes the coordinator on each finish.

```sh
ki agent decide gov "Ship the launcher."
ki agent queue gov build task.md --workdir ~/src/repo --rules push
ki agent dispatch gov --max 4
ki agent wait gov --next
```

See [run detached background agents](docs/guides/user/background-agents.md).

## Automate canonical batch records

`ki repo batch prepare`, `validate`, `run`, and `close` provide deterministic local file mechanics for an already-approved exact set of Ready work items. The commands protect the authority payload, bind a run, append explicit item evidence, and require every named item to match the approved completion target before recording closure. They do not select or implement work, infer approval, change work lifecycle, accept or prune items, push, or release.

Batch operations use the parent `ki repo` selector and require exactly one repository. From elsewhere, use `ki repo --repo /path/to/repository batch <action>`.

```sh
ki repo batch prepare --item KI-EXAMPLE-001 --item KI-EXAMPLE-002 --approved \
  --authority-mode reviewed-items --expires-at 2099-01-01T18:00:00Z \
  --completion-target awaiting-review
ki repo batch validate KI-EXAMPLE-BATCH-001
ki repo batch run KI-EXAMPLE-BATCH-001
```

Replace the illustrative identifiers and expiry with the approved Ready items and active window for the selected repository.

See [canonical batch records](docs/guides/user/batch-records.md) for result and close examples, retained-record handling, and the process-authority boundary.

## Inspect governed work

`ki repo roadmap summary` shows selected repositories as rows against lane columns: the horizons `now`, `next`, `soon`, `future` and `hold`, then `triage`, `done` and `cancelled`. Each cell shows lifecycle-status counts and its sum, such as `d=1 r=2 Σ=3`; the `Σ` column and row aggregate repositories and lanes. The legend expands `t` (triage), `d` (draft), `r` (ready), `ip` (in-progress), `ar` (awaiting-review), `x` (done), and `c` (cancelled). `—` means no items in that cell, and `?` means unavailable. Repositories without a roadmap are named below the table. Malformed records remain diagnostic and return status `1`; counts include valid items only. The summary omits item identifiers, titles, and trade records. `ki repo roadmap summary --by project`, `--by initiative` or `--by area` shows one row per group instead, aggregated across the selected set.

`ki repo roadmap list --format json` emits the versioned, path-free `ki/roadmap/v1` projection with canonical record URLs for integrations. Each item carries its `lane`, the classification fields `kind`, `purpose`, `project`, `initiative` and `component`, and a `legacy` list naming any old shapes it still uses.

Linked roadmap items show one compact ticket reference after the title, such as `PC:KIS-42 +2`, with a legend for provider abbreviations. The count covers additional distinct tickets; implementation links take precedence. Use `ki repo roadmap list --links all` to expand every mapping beneath its item, with the provider, ticket key, relation, and full task URL on a further indented line. Matching keys are qualified when needed. Both views use local mappings without contacting ticket systems; links do not imply current task status or ownership.

`ki repo roadmap list` reads the canonical work-item records in selected repositories without changing them. The roadmap location comes only from the declared `[skills.ki-work].adapter` and its adapter table, never from an existing directory. A selected repository that declares no local adapter, or lacks its declared roadmap directory, contributes no roadmap and does not make the list fail; malformed, unsafe, unreadable, or misconfigured roadmap evidence remains a diagnostic and returns status `1`.

Its default deterministic text output uses the same framed grouping style as repository audits: each repository has a header, nested horizon and lifecycle branches, its import and export trade context, diagnostics, and a compact summary. Use `--aggregate` for one selected-set inventory grouped by lane; item identifiers carry the repository-aligned prefix, while no-roadmap and diagnostic sections name their repositories. It is a scanning view, not a cross-repository priority queue. Lanes run `now`, `next`, `soon`, `future`, `hold`, then `triage`, then `done` and `cancelled` last, and the summary shows the `NOW=` count without a cap. Records in old shapes - the `waiting-for`, `parked` or `triage` horizons, `theme`, `waiting_on_trades`, `intake_disposition`, or an adopted open record without `kind` - still list, marked `legacy` and counted in `LEGACY=`. A `component` must be declared in the repository's `[skills.ki-work-roadmap].components` vocabulary; any other value makes the record unreadable. Use `--horizon <value>` or `--status <value>` to filter records before rendering; `--horizon` also takes a comma-separated list or a repeated flag, as in `--horizon now,next`. The roadmap folder's `README.md` index is not read as a work item.

`ki repo roadmap list --by project` or `--by initiative` groups text output by the record's project or initiative, deriving a project's initiative from the Capital's `Streams/Projects/` notes and reading Initiatives from `Streams/Initiatives/`, which it finds through the repository's declared `[skills.ki-repo].capital` and the local ki registry. Records with neither land in an `unassigned` group. An unavailable registry, the retired `Streams/Projects/Initiatives.md` index, or a record whose project and initiative disagree, is a warning; the list still renders and exits `0`. `--by area` groups by the record's fixed area, labelled with the title that `[skills.ki-work-roadmap.areas]` maps to its code; a legacy bare areas list still reads, without titles. `--by` implies `--aggregate`: groups span the whole selected set, the same Project from several repositories merges into one group, a Project from another territory is qualified with that territory's name, and each Project group shows its registry `lifecycle`, such as `[active]`. `--by` applies only to text output. For example, `ki repo --agora kis roadmap list --by project --horizon now,next` shows the Now and Next work of a whole Agora by Project.

`ki repo roadmap stats` reports active count, median and maximum age and inactivity, plus a selected-set aggregate when multiple repositories are selected. Text output renders compact compound durations such as `1d 2h 3m 4s`; `--format json` retains exact numeric seconds in the versioned automation contract. `--stale-after <positive-duration>` accepts seconds, minutes, hours, or days such as `7d`.

Malformed or unsafe work items become a diagnostic for only that selected repository, while other selected repositories still report; any such diagnostic makes the command exit with status `1`.

`ki repo roadmap prune [id]` removes every canonical `done` or `cancelled` record in the selected repository set when no ID is supplied. With an ID, it requires exactly one selected repository and removes only that named terminal record. By default it then commits each repository's deletions as one commit containing only those paths, with the subject `chore(roadmap): prune <N> done work record(s)` and one `- <ID>` body line per record; commit hooks run, a failed commit restores the records, a commit that a hook widened with other paths is reported as an error, and Git history remains the archive. Before deleting anything it refuses a repository that is not a Git work tree, has staged changes, or holds an untracked or modified selected record. `--no-commit` only deletes the records, and `--dry-run` reports the records and planned commits without changing anything. `ki repo roadmap promote <id> [horizon]` and `ki repo roadmap demote <id> [horizon]` move one explicitly named item one horizon toward `now` or `hold`, respectively; an optional destination permits a direct move only in that direction, and the destination must suit the status (`ready` sits at `now`, `next` or `hold`; `in-progress` and `awaiting-review` at `now` or `hold`). Entering `hold` requires `--reason waiting-for|parked` and `--condition <text>`, with an optional `--review <date>`; leaving `hold` requires an explicit destination and removes the hold. Triage, done, cancelled and legacy-shaped records do not move. These operations change only the canonical work-item file and preserve lifecycle status.

`ki repo roadmap migrate` previews the mechanical move of open records to the current model: a `triage` horizon becomes `status: triage`, `waiting-for` and `parked` become `horizon: hold` with a condition lifted from the record or a `REVIEW:` placeholder, and `waiting_on_trades` becomes `hold.trades`. It prints a before and after comparison per record and leaves `theme`, `kind`, `project` and `purpose` alone. `--apply` writes the changes, advancing `updated_at`, and requires exactly one selected repository; it never commits, and a second run finds nothing to do.

Creation, shaping, readiness, implementation, acceptance, and completion remain harness-process and human-authority operations. The native commands do not infer those judgments from a trade or alter a peer repository.

## Inspect cross-repository trades

Routes come only from the territory Capital. Every `.ki.toml` names its Capital in `[skills.ki-repo].capital`, and the Capital's `[skills.ki-trades.territory]` table declares the channels, standing grants and knowledge subtypes for its listed members; a member's own `[skills.ki-trades]` table may hold only `map_bonus`. A route is active when its peer is registered once, declares `[skills.ki-trades]` and names the same Capital. When the Capital is not registered locally, trade commands fail with `territory policy lives in <capital>, not available here` rather than report no routes. `ki repo trade policy show` prints the resolved policy, `ki repo trade policy check` classifies every member against it, and `ki repo trade policy compare --baseline <path>` reports any active route lost against a saved `ki/trade-routes/v1` report; it always sweeps the whole local registry, whatever the repository selection, and rejects a malformed baseline rather than coercing it. A Capital declares `territory_name` and `territory_members` under `[skills.ki-repo]`, and `territory_members` must be sorted ascending in code-point order; the retired `[skills.ki-repo.territory]` table is refused with its migration. A repository that declares `[skills.ki-trades]` but whose Capital does not resolve is never dropped silently: aggregate route and trade lists and the policy comparison print `skipped: <identity> (<reason>)` and add `SKIPPED=<n>` to the summary, JSON output and `trade show` write that line to standard error, and selecting such a repository alone fails closed with the reason.

`ki repo trade routes list` presents the current repository's granted export and import routes in a framed tree, including their registered-estate state. `ki repo --estate trade routes list` presents every registered repository's valid route declarations as lexical repository pairs: the left and right endpoint cells span two directional rows, with `→` and `←` showing what each side sends; an absent direction is explicit as `—`. The table adapts to the live terminal width, using the same pair model in a stacked view when it is narrow. `--incomplete` focuses either inventory on routes awaiting reciprocity or with ambiguous peers. `ki repo --estate trade routes list --format json` emits the versioned `ki/trade-routes/v1` contract for applications such as Knowledge Islands Observatory. It contains validated canonical identities, route evidence, resolution, and bounded map bonuses, but no registry paths, declaration paths, or presentation-derived layout weights.

`ki repo trade prepare` creates a mutable sender-local preparation with a mandatory observation policy: `unattended`, `receipt`, `decision`, or `completion`. A receiver with the reciprocal route may use `ki repo trade observe` to compare the sender's committed preparation with the commit it last observed; this does not receive or act on the preparation. `ki repo trade submit` freezes the preparation as an outbound record, while `ki repo trade abandon --yes` removes an unsubmitted preparation.

`ki repo trade receive <trade-id>` imports one committed submission and records its source commit. `ki repo trade receive --all` previews every receivable trade and changes nothing until `--yes` is also supplied. Receiver-owned decision evidence remains local; the sender-owned envelope and body are immutable.

`ki repo trade standing` lists and checks the standing grants the Capital policy layers on ordinary knowledge routes; a grant is active exactly when its knowledge route is active. From the receiver, `ki repo trade standing capture` appends a marked, commit-pinned `STI-*` provenance block to an existing local Markdown file only after the source commit and path resolve and the exact grant is active. An inactive, ambiguous or withdrawn grant retains the ordinary itemized-trade fallback and grant no direct-capture authority. See the [standing knowledge-intake guide](docs/guides/user/standing-knowledge-intake.md) for the complete workflow.

`ki repo trade list` presents visible preparations, imports, and exports for the selected repository; `ki repo --estate trade list` combines those views across the registered estate, including imports awaiting receipt in each receiver. `ki repo --estate trade show <trade-id>` similarly shows selected copies across repositories. `--repo <path-or-pattern>` and `--agora <name>` use the same parent selection rules as other repo operations. Mutating trade commands require exactly one selected registered repository. Each item identifies its peer (`→ receiver` or `← sender`), kind (`⚒` work or `ⓘ` knowledge), observation policy, and lifecycle: preparing or submitted, receipt state, receiver decision, and release or prune eligibility. Sender release becomes eligible according to the selected observation policy; receiver prune becomes eligible only after that release is observable. `ki repo trade release --eligible` and `ki repo trade prune --eligible` preview their batches and require `--yes` to apply them. These trade and the existing report and diagnostic symbols come from one bounded presentation registry; structural tree and table characters remain part of their renderers.

`ki repo roadmap list` includes that record context for each selected repository, so planning work and incoming or outgoing trades can be scanned together without changing either lifecycle. If the local registered trade estate cannot be read, it reports that context as unavailable and exits with status `1` after rendering the inventory.

## Install MCP source releases

Install a governed MCP server source from an exact annotated release, or omit the version to select its latest stable GitHub Release:

```sh
ki mcp install owner/repository 1.2.3
ki mcp install owner/repository
ki mcp list owner/repository
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
- [Changelog](CHANGELOG.md) consolidates the current pre-1.0 command surface and notable changes; tags and releases retain the exact 0.x snapshots.

## Find local capabilities and documentation

`ki harness search <query>` searches only verified installed harness capabilities, without contacting a registry or discovering a repository.

`ki repo store list|create|bind|unbind` manages the store roles declared by a selected Knowledge Base: `notes` remains the repository root, while `sources` and `legacy` use explicit machine-local bindings. `ki vscode check` and `sync --write` consume bound `sources` for chezmoi-managed workspace and trusted-folder projections, ignore `legacy`, and never infer associations from directory names or run `chezmoi apply`. See the [repository operations](docs/guides/user/repository-operations.md#manage-declared-stores) and [VS Code projection](docs/guides/user/vscode-management.md) guides.

`ki diag` reports share-safe tool/version, proven installation mode, executing host platform/architecture, runtime, and configuration state; `--full` includes local paths and identities. `ki doctor` adds its read-only health scope, checks, verdict, and pass/warn/fail/skipped counts, including direct-CWD legacy `.ki-meta/` and `.ki/` findings; it does not check package freshness. `ki repair` previews repairs to missing, dangling, or stale configured user-skill projections and recognised legacy configuration metadata; `ki repair --apply` applies them. `ki repo repair` handles a selected repository's KI-managed projections. `--dry-run` changes nothing in either. `ki docs` prints labelled public CLI, site, manual, and roadmap locations without opening a browser.

[Maintain a local installation](docs/guides/user/local-installation.md) explains the local-only behaviour and safety boundary of each of these, including which of them only ever report. Use `ki --help` or `ki <command> --help` for exact grammar; the tracked manual remains authoritative.
