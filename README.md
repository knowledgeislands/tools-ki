# ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

Optional `ki kb index`, `ki kb search` and `ki kb status` operate one explicitly assigned registered Knowledge Base through a private derived qmd generation. [Search one Knowledge Base](docs/guides/user/kb-search.md) explains model provisioning, isolated state, operator daemon bindings and source-authenticated citations.

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agent-backpack), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-principal) remains the source of Knowledge Islands philosophy and model, and its [Engineering Practice](https://github.com/knowledgeislands/ki-principal/blob/main/Pillars/Engineering%20Practice/Engineering%20Practice.md) translates that philosophy into engineering practice. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](https://github.com/knowledgeislands/ki-principal/blob/main/Admin/Governance/Decisions/GDR-KI-PRINCIPAL-006-knowledge-islands-ecosystem-fundamentals.md) defines the six authorities and publication flows.

The active TypeScript command host provides local capability, repository, Territory, and trade operations. Source acquisition has moved to the Inbox's `ki-muninn` (krisb/inbox); `ki acquire` now only says so and exits non-zero. The sections below describe the current public surface; use `ki --help` or the tracked [ki(1) manual](man/ki.1) for exact grammar.

## Getting started

If `ki` is not yet installed, read [install ki and run it for the first time](docs/guides/user/getting-started.md). It covers installing a signed release, creating the user environment with `ki bootstrap`, registering a repository, and verifying each step. The rest of the [user guides](docs/guides/user/README.md) carry the procedures for everything described below.

Once installed, run `ki -h` for an alphabetical command list, then `ki <command> -h` for the selected command's options. The manual groups commands by purpose. `ki docs` locates the fuller references.

## Manage installed capabilities

A territory's bundle of skills is its backpack, published from an `<owner>/<territory>-agent-backpack` repository such as `knowledgeislands/ki-agent-backpack`. `ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage verified backpack payloads without activating or deactivating skills; the command keeps its `harness` name.

Use a backpack identifier such as `example/harness`.

A compatible backpack declares its stable capability namespace in its root `.ki.toml`, for example `[skills.ki-repo-backpack]` with `prefix = "ki"`. Every published skill uses that prefix (`ki-*`), and `ki` refuses a second installed backpack claiming it. Distinct prefixes such as `ki` and `hnr` coexist; competing backpacks using the same prefix do not.

Backpack repositories were named `<owner>/<territory>-agentic-harness` until 14 November 2026. For this one release `ki` still reads that spelling wherever an identifier appears — in `config.toml`, a repository's `.ki.toml`, or a command argument — as the same backpack, finds an installed backpack still on disk under it, and reads the retired `[skills.ki-repo-harness]` prefix declaration. In `config.toml`, each user skill names its provider with `backpack = "<owner>/<name>"`; the retired `harness =` key is still read, with a warning, and bootstrap writes it as `backpack =`.

An immutable private GitHub harness archive may opt into the local GitHub CLI credential without placing a token in configuration, by declaring `auth = "github-cli"` alongside its commit-pinned codeload URL and SHA-256.

[Install harnesses and activate their skills](docs/guides/user/capability-lifecycle.md) covers the installation-versus-activation boundary, the user and repository activation scopes, the private-archive declaration in full, and the refusals that protect an active capability from being removed underneath it.

## Update verified installations

`ki update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki completion bash` and `ki completion zsh` print corresponding completion source derived from the registered CLI tree, so the completions cover every command path and valid option name without a second list to maintain.

`ki repo upgrade` refreshes the uniquely resolved providers declared by one or more selected KI repositories.

Neither command changes user or repository skill activation. [Maintain a local installation](docs/guides/user/local-installation.md) covers update ownership, shell completion, diagnosis, and repair.

## Territories

A Capital owns its territory through `[skills.ki-repo].territory_name` and `territory_members`. The Capital names itself in `capital` and lists every member, including itself, in sorted canonical HTTPS GitHub identity order. Member repositories declare the same `capital`; selection does not depend on a trade policy.

The optional Capital-only `territory_prefix` supplies the territory handle, such as `ki`. Without it, use the Capital's local registry key. An explicit prefix replaces that key as a selector. A Capital may also declare `territory_aliases`, extra selectors that resolve to its canonical handle; they never appear in output or name a sources store. `ki territory list` discovers these handles; `show`, `audit`, `open` and `inspect` accept `-t, --territory <handle>`, `--estate` or `--principals`.

`--principals` selects only the registered territory Capitals. The system Capital — the one whose territory includes the canonical KI backpack, `knowledgeislands/ki-agent-backpack` — comes first, then the others by territory name. `ki territory open --principals --target zed` opens them so Zed's project list follows that order; VS Code and Delta receive the same order.

A personal `[territories] ranking` of handles in `config.toml` puts your territories in your own order of priority. `--principals`, `ki territory list` and `--estate` follow it, and territories it omits keep the order above. See [Select a territory or the estate](docs/guides/user/territory-selection.md#rank-your-territories).

`ki territory roots --null --territory knowledge-islands` returns deterministic absolute primary checkout paths separated by NUL bytes. Repeated `--filter <prefix>` arguments narrow the directory basenames literally and case-sensitively, with OR semantics. Naming metadata must be complete before filtering. A member it cannot resolve, whether unregistered, renamed, with its checkout gone, unreadable or under another Capital, is left out with one warning on stderr naming the cause and the repair, while the rest are listed; `ki territory show` and `audit` report the same members and exit 1.

`ki territory inspect --territory knowledge-islands --target vscode --workspace <absolute-file>` compares a local projection read-only. It reports matched, missing, extra registered, unregistered KI and external roots. An exact projection exits `0`, drift exits `1`, and an invalid selection exits `2`. Opening uses the existing Zed, VS Code and Delta local adapters. Historical local Agora reference state is retained as provenance and has no selection role.

## Select repository targets

Supported `ki repo` operations accept repeated `--repo <path-or-pattern>`, `-t, --territory <handle>`, `--estate`, or `--principals`. These primary scopes are mutually exclusive. Repeated `--filter <prefix>` values narrow any scope, including the native default, using literal case-sensitive directory basenames. Empty prefixes or no matches fail before execution.

Without an explicit scope, KI keeps the current repository or direct-CWD `.mgit.toml` selection. Workspace manifests select their existing members, recurse through child workspaces, skip bare stores and apply filters before nested `main/` checkout expansion. KI never invokes `mgit`. Every selected physical root must be available; registered territory members must match their canonical identity and Capital. Registration completeness is checked before filtering.

Existing physical mGit members without `.ki.toml` are skipped; `ki repo audit` names them in normal and concise output. Missing or unsafe checkouts, unsafe or invalid KI declarations, and a selection with no KI repositories fail.

Set `KI_QUIET` to any value but an empty one or `0` to give `ki repo audit` and `ki repo conform` the output of `--concise --progress never` without passing the flags. A failing repository still renders its FAIL findings, and any explicit output flag gives that call its ordinary output.

After target selection, operations run in target order. Read-only operations isolate a target's diagnostic; mutations retain earlier successful targets if a later target fails and return a non-zero overall result. The machine-local registry is `$XDG_STATE_HOME/ki/registry.toml`; every keyed entry holds a canonical HTTPS GitHub identity and checkout path. Use `ki registry add --repo <path-or-pattern>` to record selected canonical KI roots without applying repairs. `ki repo store scan` reports conventional OneDrive source directories for selected repositories that lack a declared `sources` role; use `ki repo --estate store scan` to check every registered repository. It only warns and leaves every store untouched. `ki bootstrap --refresh` imports the retired configuration path list once and removes it from user configuration. A local `ki repo conform` also records each selected root first, even when its later conformance checks fail, so the registry remains an inventory for repair and bulk maintenance rather than a compliance badge.

```toml
schema = 1

[repositories."ki-agent-backpack"]
repository = "https://github.com/knowledgeislands/ki-agent-backpack"
path = "/Users/example/workspaces/knowledgeislands/ki-agent-backpack"
```

For each selected repository, `ki repo conform` collects safe write proposals and completes every initial audit before publishing any of those proposals. A failing initial audit aborts that repository's conform publication: no proposed conform write is applied. With `ki-repo` selected, conform first moves a Husky commit gate into a committed, bound `.githooks/` and removes Husky. On a terminal, audit and conform use a compact receipt stream with one mutable activity row that signals activity without estimating completion.

[Audit and conform repositories](docs/guides/user/repository-operations.md) covers target selection, reading an audit result, the exact meaning of conform's `proposed write`, `applied write`, and `would apply write` verbs, what the publication boundary does not cover, the output and progress controls, and repair.

To start a KI repository, run `ki repo init` in an existing Git worktree root, or name that root as its one argument. Supply its canonical `--repository https://github.com/<owner>/<name>`, its territory Capital as `--capital https://github.com/<owner>/<name>` (the repository itself when it is a Capital), `--title`, `--description`, `--repo-code`, one or more `--runtime` values (`claude-code` or `chatgpt-codex`), and `--visibility public|private`. Initialization declares a Project with `repo_type = "project"`, `primary_shape = "ki-repo-project"`, and the baseline shape skill, then registers that physical root locally; it never runs `git init`, guesses identity, activates skills, creates a Territory, or overwrites an existing declaration.

Every `[skills.ki-repo]` declaration requires an explicit `repo_type` and `primary_shape`. The shape must name a declared core Project shape, or `ki-repo-kb` when `repo_type = "kb"`. Specialist and refining skills remain composable; their presence does not choose or change the primary shape. The `ki-repo` skill owns the allowed shapes and compatibility rules.

```sh
ki territory list
ki territory audit --estate
ki territory audit --estate
ki territory inspect --estate --target vscode --workspace "$PWD/knowledge-islands.code-workspace"
ki territory show --estate
ki territory roots --estate | xargs -n 1 sh -c 'git -C "$1" status --short' _
ki territory roots --estate --null | xargs -0 -n 1 sh -c 'git -C "$1" status --short' _
ki territory open --estate --target zed
ki territory open --principals --target zed
ki repo init --repository https://github.com/example/example --capital https://github.com/example/example --title 'Example repository' --description 'An explicit KI repository identity.' --repo-code EXAMPLE --runtime claude-code --runtime chatgpt-codex --visibility private
ki diag
ki repo diag
ki repo repair --dry-run
ki repo --estate audit
```

## Delegate and link work

Delegation uses the session harness's own subagents, under the `ki-delegation` skill; `ki` does not launch agents.

`ki link <identifier...>` prints the Markdown link to each roadmap record an owner report cites: the local file by absolute path, or for a pruned record its last committed revision on the canonical repository.

```sh
ki link KI-TOOL-KI-CLI-127 KI-TOOL-KI-CLI-124
```

## Read the work model

`ki work status` reads each `+/_WORK/<id>/` work folder in a repository and shows its work in five views: with you, stuck, blocked, moving and on hold. A work package takes its state from `state.md` and its definition from its entry file, `_index.md`, or `work.md`, its former name, where the folder has no `_index.md`; a single-file work folder takes both from its entry file. A folder holding both names is a warning. Whose move it is comes from that state, a work with lines waiting in its message queue shows how many are pending. `+/_WORK_REVIEW/` shows only as a count. Through the work model's tolerance window, `+/_CHECKPOINTS/` files still read, each with a warning naming its new home. `--format json` writes the versioned `ki/work-status/v1` report, each entry carrying its routing `description`, `method_read` revision and pending `messages` count. `--view routing` replaces the five views with the routing listing State of play reads to choose which work takes a unit of work: one line per unfinished work with its id, state, pending count and description cut to one line.

```sh
ki work status --repo ~/workspaces/knowledge-islands/ki-principal
ki work status --format json
ki work status --view routing
```

`ki work base` reads every change document, `*.change.md`, under `+/_WORK/` in each registered repository, and each design note that already carries a `Base:` line, and flags those whose touched files have moved since their base. It resolves the `Base: <repository>@<commit>` line in that registered checkout, skips a document whose `Status:` says graduated, and compares the `Touches:` files between the base and the checkout's `origin/main`, renames and deletions included. Each document is moved, with its files, current, or unknown, with the reason, never a pass, where the base is missing, unpushed or not in the checkout. It fetches nothing, so fetch the base checkout first. It exits 1 when any document is moved or unknown; `--format json` writes the versioned `ki/work-base/v1` report and `--repo <dir>` reads one repository only.

```sh
ki work base
ki work base --repo ~/workspaces/personal/inbox --format json
```

## Check commit messages

`ki git check-message <file>` checks a commit message against the deterministic `ki-git` rules, so that a repository's committed `.githooks/commit-msg` needs no package. A pass is silent; a failure exits 1 naming the rule and the remedy.

```sh
ki git check-message "$1"
```

## Convert Obsidian links to GitHub Markdown

`ki markdown gfm` converts the wikilinks and unsized image embeds in explicit paths to document-relative GitHub-flavoured Markdown links, in each target's exact on-disk case. Anything that needs judgement is left untouched and listed. A dry run prints each diff and writes the preview the owner reviews; the apply then writes nothing unless the batch still matches that preview and every listed item is decided. It writes a rollback manifest before the first changed file.

```sh
ki markdown gfm --dry-run --preview /tmp/streams.preview.json Streams
ki markdown gfm --decisions streams.toml --dry-run --preview /tmp/streams.preview.json Streams
ki markdown gfm --decisions streams.toml --preview /tmp/streams.preview.json --manifest /tmp/streams.manifest.json Streams
```

See [convert Obsidian links to GitHub Markdown](docs/guides/user/markdown-conversion.md).

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

`ki repo roadmap summary` shows selected repositories as rows against lane columns: the horizons `now`, `next`, `soon`, `future` and `hold`, then `triage`, `done` and `cancelled`. Each cell shows lifecycle-status counts and its sum, such as `d=1 r=2 Σ=3`; the `Σ` column and row aggregate repositories and lanes. The legend expands `t` (triage), `d` (draft), `r` (ready), `ip` (in-progress), `ar` (awaiting-review), `x` (done), and `c` (cancelled). `—` means no items in that cell, and `?` means unavailable. Repositories without a roadmap are named below the table. Malformed records remain diagnostic and return status `1`; counts include valid items only. The summary omits item identifiers, titles, and trade records. `ki repo roadmap summary --by project`, `--by theme` or `--by area` shows one row per group instead, aggregated across the selected set.

`ki repo roadmap list --format json` emits the versioned, path-free `ki/roadmap/v1` projection with canonical record URLs for integrations. Each item carries its `lane`, the classification fields `kind`, `purpose`, `project`, `theme`, the legacy `initiative`, and `component`, its `priority` (`medium` when unset), `size` and `assignee` (each `null` when unset), a `legacy` list naming any old shapes it still uses, and a `gaps` list naming each field-migration gap.

Linked roadmap items show one compact ticket reference after the title, such as `PC:KIS-42 +2`, with a legend for provider abbreviations. The count covers additional distinct tickets; implementation links take precedence. Use `ki repo roadmap list --links all` to expand every mapping beneath its item, with the provider, ticket key, relation, and full task URL on a further indented line. Matching keys are qualified when needed. Both views use local mappings without contacting ticket systems; links do not imply current task status or ownership.

`ki repo roadmap list` reads the canonical work-item records in selected repositories without changing them. The roadmap location comes only from the declared `[skills.ki-work].adapter` and its adapter table, never from an existing directory. A selected repository that declares no local adapter, or lacks its declared roadmap directory, contributes no roadmap and does not make the list fail; malformed, unsafe, unreadable, or misconfigured roadmap evidence remains a diagnostic and returns status `1`.

Its default deterministic text output uses the same framed grouping style as repository audits: each repository has a header, nested horizon and lifecycle branches, its import and export trade context, diagnostics, and a compact summary. Use `--aggregate` for one selected-set inventory grouped by lane; item identifiers carry the repository-aligned prefix, while no-roadmap and diagnostic sections name their repositories. It is a scanning view, not a cross-repository priority queue. Lanes run `now`, `next`, `soon`, `future`, `hold`, then `triage`, then `done` and `cancelled` last, and the summary shows the `NOW=` count without a cap. Within each lane, open records run unblocked before blocked, then by `priority` (`high`, `medium`, `low`; unset is `medium`), then by `size` smallest first with unsized last; priority never crosses lanes, and an aggregate view keeps each repository's records together. Labels show a non-medium priority and any size. `priority` must be `high`, `medium` or `low`, `size` must be `s`, `m`, `l` or `xl`, and a `ready` record must not be `xl`; any other value makes the record unreadable. During the field migration window, a `gaps` section names each open record without `size`, an adopted open record without `kind`, a retired `initiative`, a theme named beside its project, `purpose: adoption`, or a retired horizon, in the Harness checker's wording, and the summary counts them in `GAPS=`; done and cancelled records are exempt from the `size` and `kind` gaps, and gaps never change the exit status. Records in old shapes - the `waiting-for`, `parked` or `triage` horizons, `theme`, `waiting_on_trades`, `intake_disposition`, or an adopted open record without `kind` - still list, marked `legacy` and counted in `LEGACY=`. A `component` must be declared in the repository's `[skills.ki-work-roadmap].components` vocabulary; any other value makes the record unreadable. Use `--horizon <value>` or `--status <value>` to filter records before rendering; `--horizon` also takes a comma-separated list or a repeated flag, as in `--horizon now,next`. The roadmap folder's `README.md` index is not read as a work item.

`ki repo roadmap list --by project` or `--by theme` groups text output by the record's project or theme, deriving a project's theme from the Capital's `Streams/Projects/` notes and reading themes from `Streams/Themes/`, which it finds through the repository's declared `[skills.ki-repo].capital` and the local ki registry. Records with neither land in an `unassigned` group. An unavailable registry, or a record whose project and theme disagree, is a warning; the list still renders and exits `0`. Through the work model's tolerance window, `Streams/Initiatives/`, Project folder notes, a Project's or record's `initiative`, and the retired `Streams/Projects/Initiatives.md` index still read, each with a warning naming its new home. `--by area` groups by the record's fixed area, labelled with the title that `[skills.ki-work-roadmap.areas]` maps to its code; a legacy bare areas list still reads, without titles. `--by` implies `--aggregate`: groups span the whole selected set, the same Project from several repositories merges into one group, a Project from another territory is qualified with that territory's name, and each Project group shows its registry `lifecycle`, such as `[active]`. `--by` applies only to text output. For example, `ki repo --territory knowledge-islands roadmap list --by project --horizon now,next` shows the Now and Next work of a whole territory by Project.

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

`ki repo trade list` presents visible preparations, imports, and exports for the selected repository; `ki repo --estate trade list` combines those views across the registered estate, including imports awaiting receipt in each receiver. `ki repo --estate trade show <trade-id>` similarly shows selected copies across repositories. `--repo <path-or-pattern>` and `--territory <name>` use the same parent selection rules as other repo operations. Mutating trade commands require exactly one selected registered repository. Each item identifies its peer (`→ receiver` or `← sender`), kind (`⚒` work or `ⓘ` knowledge), observation policy, and lifecycle: preparing or submitted, receipt state, receiver decision, and release or prune eligibility. Sender release becomes eligible according to the selected observation policy; receiver prune becomes eligible only after that release is observable. `ki repo trade release --eligible` and `ki repo trade prune --eligible` preview their batches and require `--yes` to apply them. These trade and the existing report and diagnostic symbols come from one bounded presentation registry; structural tree and table characters remain part of their renderers.

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

`ki repo store list|create|bind|unbind|absent` manages the store roles declared by a selected Knowledge Base: `notes` remains the repository root, while `sources` and `legacy` use explicit machine-local bindings or a recorded absence on this host. A missing or unavailable store warns with its fix and never blocks `open`, `repair`, `vscode sync` or `doctor`; a folder the host refuses, as macOS privacy protection does over SSH, reads as `access denied` with its fix, never as missing. An error with a known remedy prints it on a `next:` line. `ki vscode check` and `sync --write` consume bound `sources` for chezmoi-managed workspace and trusted-folder projections, ignore `legacy`, and never infer associations from directory names or run `chezmoi apply`. See the [repository operations](docs/guides/user/repository-operations.md#manage-declared-stores) and [VS Code projection](docs/guides/user/vscode-management.md) guides.

`ki diag` reports share-safe tool/version, proven installation mode, executing host platform/architecture, runtime, and configuration state; `--full` includes local paths and identities. `ki doctor` adds its read-only health scope, checks, verdict, and pass/warn/fail/skipped counts, including direct-CWD legacy `.ki-meta/` and `.ki/` findings; it does not check package freshness. `ki repair` previews repairs to missing, dangling, or stale configured user-skill projections and recognised legacy configuration metadata; `ki repair --apply` applies them. `ki repo repair` handles a selected repository's KI-managed projections. `--dry-run` changes nothing in either. `ki docs` prints labelled public CLI, site, manual, and roadmap locations without opening a browser.

[Maintain a local installation](docs/guides/user/local-installation.md) explains the local-only behaviour and safety boundary of each of these, including which of them only ever report. Use `ki --help` or `ki <command> --help` for exact grammar; the tracked manual remains authoritative.
