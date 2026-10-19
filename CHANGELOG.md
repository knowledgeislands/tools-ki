# Changelog

This is the consolidated Pre-1.0 baseline for KI's current command surface and notable changes. It is updated as the tool evolves rather than divided into 0.x release entries. Tags, GitHub releases, and commit history identify exact 0.x snapshots.

## Pre-1.0 baseline

This baseline describes the `v0.11.4` release. Domain imports and extracted type leaves keep the dependency graph acyclic, enforced by a resolved-graph boundary gate with a supported isolated compiler and deliberate failure fixtures.

### Knowledge Base search

- `ki registry add --search-boundary <id>` explicitly assigns one unique KB trust boundary; `ki kb index` builds a fresh private generation, `ki kb search` returns bounded current-source-authenticated JSON, and `ki kb status` reports endpoint liveness without index attestation. qmd 2.8.3 and local models require explicit provisioning.
- `ki kb search` mirror labels come only from `mirrors`, `mirror_type` and `mirror_sha256`, which replace the `source_path` and `source_sha256` result fields; `source_*` provenance on derived notes never produces a mirror label.
- `ki kb search` labels a mirror `extract` from its non-`indexed` `mirror_type` whenever the body has content, replacing the 40-word extract minimum; an empty body is a `pointer`.

### Command surface

#### General

- `ki`
- `ki --help`
- `ki help [command...]`
- `ki --version`

#### Installation

- `ki bootstrap`

#### Local management

- `ki completion <shell>`
- `ki harness outdated`
- `ki harness missing`
- `ki update`
- `ki cleanup`
- `ki diag [--full]`
- `ki doctor`
- `ki repair [--apply | --dry-run]`
- `ki docs`
- `ki inventory`
- `ki link <identifier...>`
- `ki mcp install <owner/repository> [version] [--auth github-cli]`
- `ki mcp update <owner/repository> [version] [--auth github-cli]`
- `ki mcp rollback <owner/repository> <version>`
- `ki mcp uninstall <owner/repository>`
- `ki mcp list [owner/repository] [--format text|json]`
- `ki harness search`
- `ki vscode check`
- `ki vscode sync [--write]`

#### User management

- `ki skill add`
- `ki skill remove`

#### Territory management

- `ki territory list`
- `ki territory audit (--territory <handle>|--estate) [--filter <prefix>]...`
- `ki territory inspect (--territory <handle>|--estate) [--filter <prefix>]... --target <zed|vscode> --workspace <selector>`
- `ki territory show (--territory <handle>|--estate) [--filter <prefix>]... [--verbose]`
- `ki territory roots (--territory <handle>|--estate) [--filter <prefix>]... [--null]`
- `ki territory open (--territory <handle>|--estate) [--filter <prefix>]... --target <zed|vscode|delta>`

#### Repository options

- `ki repo --repo <path-or-pattern>`
- `ki repo -t, --territory <handle>`
- `ki repo --filter <prefix>`
- `ki repo --estate`

#### Repository management

- `ki repo init --capital <https-url>`
- `ki repo open --target <zed|vscode|delta> [--stores|--no-stores]`
- `ki repo store list [--format <text|json>]`
- `ki repo store scan`
- `ki repo store create <sources> [--write]`
- `ki repo store bind <sources|legacy> <absolute-path> [--write]`
- `ki repo store unbind <sources|legacy> [--write]`
- `ki repo store absent <sources|legacy> [--clear] [--write]`
- `ki repo audit [--staged] [--paths <path...>]`
- `ki repo conform`
- `ki repo diag`
- `ki repo roadmap list [--horizon <horizons>] [--status <status>] [--format <text|json>] [--links <compact|all>] [--by <project|theme|area>]`
- `ki repo roadmap summary [--by <project|theme|area>]`
- `ki repo roadmap stats [--stale-after <duration>] [--format <text|json>]`
- `ki repo roadmap prune [id]`
- `ki repo roadmap promote <id> [horizon]`
- `ki repo roadmap demote <id> [horizon] [--reason <reason>] [--condition <text>] [--review <date>]`
- `ki repo roadmap migrate [--apply]`
- `ki repo educate`
- `ki repo repair`
- `ki repo skill add`
- `ki repo skill remove`
- `ki repo upgrade`

#### Batch records

- `ki repo batch prepare --item <id> [--item <id>...] --approved --authority-mode <reviewed-items|outcome> --expires-at <timestamp> --completion-target <awaiting-review|done>`
- `ki repo batch validate <record>`
- `ki repo batch run <record>`
- `ki repo batch close <record> --completion-target <awaiting-review|done> --evidence-commit <commit>`

#### Registry management

- `ki registry add`
- `ki registry list [--format <text|json>]`
- `ki registry remove <key> [--dry-run]`
- `ki registry remove --repo <path> [--dry-run]`
- `ki registry` now keeps canonical GitHub identity and checkout bindings as keyed records in the machine-local `$XDG_STATE_HOME/ki/registry.toml`; `ki bootstrap --refresh` migrates and removes the retired configuration path list, which resolution no longer reads.

#### Harness management

- `ki harness info`
- `ki harness list`
- `ki harness install`
- `ki harness reinstall`
- `ki harness uninstall`

#### Trades

- `ki repo trade routes list [--incomplete] [--format text|json]` (`--estate` for an aggregate)
- `ki repo trade routes check`
- `ki repo trade policy show|check`
- `ki repo trade policy compare --baseline <path>`
- `ki repo trade standing list|check`
- `ki repo trade standing capture`
- `ki repo trade prepare`
- `ki repo trade observe`
- `ki repo trade submit`
- `ki repo trade abandon`
- `ki repo trade receive`
- `ki repo trade list`
- `ki repo trade show`
- `ki repo trade release`
- `ki repo trade prune`

#### Acquisition

- `ki acquire images --adapter granola [--repo <path>] --source <uuid> --directory <path> --expected <count> [--dry-run]`
- `ki acquire list [--repo <path>]`
- `ki acquire import [--adapter <name>|--all] [--repo <path>] [--since <date>] [--until <date>] [--dry-run]`
- `ki acquire mark --adapter granola [--repo <path>] [--since <date>] [--until <date>] [--source <UUID...>] [--confirm]`
- `ki acquire status [--adapter <name>|--all] [--repo <path>]`
- `ki acquire reconcile [--adapter <name>|--all] [--repo <path>]`
- `ki acquire reset [--adapter <name>] [--repo <path>] [--source <identity>] [--component <name>] [--rebuild] [--confirm]`

#### Background agents

- `ki agent launch <run> <name> <workdir> <prompt-file> [--runtime claude|codex] [--add-dir <dir>...] [--rules none|push|prune|release] [--wait-for <name>...] [--model <model>] [--effort low|medium|high|xhigh|max] [--relaunch] [--repo <dir>]`
- `ki agent queue <run> <name> <prompt-file> [--workdir <dir>] [launch options]`
- `ki agent dispatch <run> --max <count> [--interval <seconds>]`
- `ki agent wait <run> [--next] [--interval <seconds>]`
- `ki agent status [<run>] [--all]`
- `ki agent send <run> <line...> [--from <run>]`
- `ki agent watch <run> [seconds]`
- `ki agent home <run> [--work <id>] [--repo <dir>]`
- `ki agent new <run> <name> [--repo <dir>]`
- `ki agent decide <run> <text...> [--log <path>] [--home <path-or-id>] [--class <class>] [--repo <dir>]`
- `ki agent reconcile <run> <number> [<home>] [--class <class>]`
- `ki agent close <run> [--delete] [--compress] [--accept-exited <name>...] [--reconciled] [--repo <dir>]`
- `ki agent sweep [--keep <n>] [--write]`

#### Work model

- `ki work status [--repo <dir>] [--format <text|json>]`

#### Estate convergence

- `ki estate converge <manifest> [--apply] [--clone] [--allow-busy <path>]...`
- `ki estate converge --rollback <log> [--apply]`

#### Development

- `ki dev local set <harness-id> <local-harness-path>`
- `ki dev local on [harness-id]`
- `ki dev local off [harness-id]`
- `ki dev skill generate`
- `ki dev skill rubric`

### Behaviours

- `ki agent` writes the progress protocol's report path in the run's state folder and copies the report into the tracked work or thread folder when `status`, `watch` or `wait` first sees the agent's `DONE`, leaving a tracked copy with changes Git does not hold, and a retired report Git holds with the same contents, as when a lost `events.state.json` replays an ended agent. An agent reports only to that state-folder path: `ki agent new` fills the skeleton's report path with it, and `launch` and `queue`, a relaunch and a dispatcher launch included, refuse with exit 1 and write nothing for a brief that names the agent's own `<name>.report.md` in the run's work folder or any `+/_WORK/<id>/`, the dispatcher recording the refusal as `failed`; a brief naming it anywhere else draws a warning. A launch from the run's `<name>.queued.md` or `<name>.draft.md` removes that copy once started, and `ki agent sweep` previews, and with `--write` removes, closed runs in `_archive/` beyond the newest ten or `--keep <n>` and each such brief left beside a newer prompt.
- `--filter <prefix>` has no short form: `-f` on `ki repo`, `ki registry` and the `ki territory` selectors is a usage error that names `--filter` and runs nothing, leaving `-f` free for force or file.
- `KI_QUIET`, set to any value but an empty one or `0`, gives `ki repo audit` and `ki repo conform` the output of `--concise --progress never`, while a failing repository still renders its FAIL findings; any explicit `--concise`, `--progress`, `--progress-style` or `--reporter-levels` restores that call's ordinary output.
- `ki` requires `ki-work-design` in place of `ki-pmo-design` among the canonical Harness's bootstrap user skills, following the Harness rename of `ki-pmo` to `ki-coordination` with no alias; `ki agent` help text and the manual name the run's work folder and the work's decisions log rather than a thread home.
- The manual and `ki work` help name `ki-work-folder` and its work-folder standard, following the Harness rename of `ki-checkpoint` with no alias; `ki work status` still reads old checkpoints, `type: ki-checkpoint`, for the tolerance window.
- `ki agent` homes a new run in the one `+/_WORK/<id>/` work folder whose slug, or for a run named before the slug whose id after the territory, is the run's name, and refuses a run that names none or two; a home recorded in the retired `+/_THREADS/` is followed into that work folder and recorded there, and one with none takes no launch, decision or report; `ki agent home <run>` prints the home, and `--work <id>` records a work folder holding `work.md` as it, moving no file.
- `ki work status` reads each `+/_WORK/<id>/work.md` read-only into the with-you, stuck, blocked, moving and on-hold views, deriving each holder and role from the state, adding each running agent of a run homed in a work folder as an item, counting `+/_WORK_REVIEW/` and warning of each unreadable work file; `+/_CHECKPOINTS/` files still read through the tolerance window, each warning naming its new home, and `--format json` writes `ki/work-status/v1`.
- `ki estate converge` reshapes this machine’s checkouts to a tracked estate targets manifest: it discovers checkouts by normalised origin remote, previews by default, and with `--apply` moves clean, idle checkouts, retargets `origin`, repairs linked worktrees, updates the local registry, renames Claude project history, rewrites untracked symlinks and removes empty former parents, logging every action for `--rollback`. A report-only sweep lists remaining old paths and renamed identities in local configuration by file and line.
- `ki agent` is the reference launcher for the `ki-delegation` background-run contract. It detaches Claude Code or Codex agents in their own session, writes each run packet under `$KI_STATE_HOME/agents/<run>/`, appends the pinned Harness's authority footer for the chosen tier, keeps a numbered decisions log, and provides a run queue, a detached concurrency-capped dispatcher, a waiter that returns on each finish, and status and watch views that flag agents which exited without `DONE`. `--model` and `--effort` choose each agent's model, passed through verbatim, and reasoning effort; `<name>.launch.json` records both, and omitting either keeps the runtime's own default. Every launched agent, through launch and dispatch alike, carries the run name in `KI_AGENT_RUN` so runtime hooks can tell a background agent from an interactive session without inspecting process state.
- `ki agent` keeps only runtime material in the state folder. A run's knowledge files, `decisions.md` and each agent's `<name>.report.md`, live in the owning repository's tracked `+/_THREADS/<run>/` folder, which `ki` alone writes but never commits; `decide` and `close` move a run's leftover state-folder `decisions.md` and reports there, where no copy exists and Git has never held one, so no thread copies them by hand and a report the thread has retired never comes back; the first `launch`, `queue`, `new` or `decide` fixes the home as the Git top level of `--repo`, or else of the launch's working directory, which the directory the command runs from must share, records it in `thread.json`, and refuses to run outside a repository; once recorded, the home holds whatever directory a later command runs from, and `<name>.launch.json` records each launch's working directory so a run that predates `thread.json` can still be given a home. `ki agent status` with no run lists every run with an agent running or held or a non-empty queue, each under a `<run> (<thread home>)` line in the `ki-pmo` banner's `- [running] <agent> - <what>` and `- [queued] <agent> - <what>` form; `--all` adds the runs at rest, `_archive` is never listed, and the listing writes nothing. `ki agent send <run> <line>` appends a timestamped line naming the sending run, from `KI_AGENT_RUN`, `--from` or the working directory's repository, to a live run's state-folder `inbox.md`, and refuses a run with nothing running, held or queued; `ki agent status <run>` prints each line sent since its last call once, as `inbox: <line>`. Names are unique within a run: `launch` and `queue` refuse a name that has already run, by its state-folder packet or thread-folder report, naming the files and the first free `<name>-<n>`, and `--relaunch` starts it again with the earlier packet set aside in `<name>.prev-<n>/`, refused while the thread-folder report has uncommitted changes. Each run keeps an append-only `events.jsonl` of `launch`, `held`, `progress`, `done`, `failed`, `blocked` and `needs-owner` events, numbered in the order they happened and carrying the agent's `attempt`: the launcher appends launches, holds, closed gates and dispatcher drops, and `status`, `watch` and `wait` derive the rest under `events.lock` from status files, pids and reports, never reporting an unchanged line or query twice. `wait --next` returns the next unseen `done`, `failed`, `blocked` or `needs-owner` event as `<name> <kind>: <text>` and keeps its cursor in `events.seen`, replacing the name-ordered `seen` file that could return an older finish first, and the first read of a run older than its events log treats agents that had already ended as seen, replaying no finish, query or `failed: no report`; `watch` prints each new event before its interval's status line; and the progress protocol offers the `milestone:`, `blocked:` and `failed:` status-line forms. Decisions are timestamped in UTC seconds and may carry a `home:` line from `decide --home` or `ki agent reconcile`, and a `class:` line, `operational`, `rule`, `standalone` or `held`, from `--class` on either; `decide <run> '<TAG> - <letter>'` logs an owner's bare option letter as `<letter>) <wording>` from the newest thread-folder report carrying that query, with a `source:` line naming it, and refuses, writing nothing, when the tag, the report or the letter is missing. `ki agent launch` creates each agent's temporary folder `$TMPDIR/ki-agents/<run>/<name>/` outside every repository, names it in the progress protocol and adds it to the agent's writable directories. The progress protocol's report path governs: `launch` and `queue` warn on standard error, and still proceed, when the brief names the agent's `<name>.report.md` in a folder other than the state or tracked folder. The authority footer starts at its `## Rules` heading line, not an earlier mention, with relative link targets made absolute. `ki agent close` retires a finished run's state folder only once its reconcile gate passes, printing every `ok` or `blocker` line and changing nothing on a blocker; a temporary folder that still holds output is a blocker that `--reconciled` waives, and once the gate passes close removes the run's temporary folders with an `ok` line for each; it archives to `_archive/<run>/` by default, compresses or deletes on request, and writes a close note naming each decision's class and home or the owner's `--reconciled` waiver; the gate passes an `operational` decision with no home as its own home, and a `held` decision whose home is a `_CHECKPOINTS/` file once that file exists, tracked or not.
- Diagnostics and doctor reports share tool/version, checkout-verified local/release/unknown installation mode, executing platform/architecture, runtime/version, and configuration state. Copied or unidentified source is unknown rather than guessed local. Doctor reports its read-only scope, verdict, and pass/warn/fail/skipped counts without implying package freshness.
- KI's own CI runs from the checked-out source, while release packaging pins a verified Harness revision.
- The canonical Harness pin is `ki-agentic-harness` `00f284c`. It carries the `ki-coordination` run-report line and the `ki-delegation` prompt shape that place an agent's report in the run's state folder and nowhere else, and the `ki-repo-tools` house form of `--filter` with no short letter. It also carries the `ki-coordination` owner glyphs, 👤 for Kris and 🎯 for every other target, with send and resume lines naming the checkout their session is grounded in; the COORD-7 shape check for record links outside the audited checkout; the `ki-engineering` SCR-11 baseline that accepts `bunx lint-staged --quiet`; the `ki-work-folder` failure for retired thread and checkpoint folders beside the work area; and the `ki-repo-tools` Unix and Linux command-line conventions. It also carries the coordination rename, with `ki-coordination` in place of `ki-pmo` and `ki-work-design` in place of `ki-pmo-design`, and the work-folder rename, with `ki-work-folder` in place of `ki-checkpoint`. It also carries the `ki-delegation` run-event vocabulary that `ki agent` derives, with `ki agent send` in place of the inbox idiom and the PMO-12 report-heading check, the `ki-checkpoint` work identity section with a Bootstrap check of the work file's level, and the `ki-repo-tools` SHELL-FATAL warning for Bats assertions that do not end `|| false`. It also carries the work model under GDR-KI-PRINCIPAL-009: `ki-pmo` coordinating work with its seven states, glyph banner and no reply block, the `ki-checkpoint` work file at `+/_WORK/<id>/work.md` read beside old checkpoints, briefs, decisions and design artefacts in the work folder, `ki-work` theme pages and flat Project notes, records classified by theme, Activities homed in regular work, and a confidence level on each recommended option, with branch previews behind Access for Cloudflare websites. It also carries the `ki-pmo` three reply forms (conversational reply, owner report and coordinator summary), thread-folder trimming at every resting point, the Space > Initiative > project thread label, the closed thread-folder list with temporary output homed in `tmp/<run>/<name>/`, the hold with its pick-up and messages blocks and pushing beneath other sessions, the `ki-work` idea-stage Projects, rooting and attribute crosswalk, the Granola screenshot and Acquired-marker contracts, the `ki-pmo` drain with its drain report and DRAINED frame, PMO-7 record linking raised to failure level, the five-minute heartbeat while work runs and the standard as the one source of the owner report, `ki-repo-harness` skill diagrams drawn per functional area with nested capability groups, the `ki-diagrams` manifest opt-in for committed diagram HTML, the `ki-repo-kb` GATE-1 wording that lets a pre-commit hook scope the gate's verdict to the staged index with `ki repo audit --staged` while CI keeps the whole-tree verdict, the `ki-pmo` coordinating-thread standard extracted from `ki-delegation`, with its rich-text Initiative › Project report heading, block-letter footer banner, stacked reply block, update cadence, concurrency practice and thread-folder tidying at each mark, the Context, Query and Options query shape, the `ki-delegation` background-run contract that places the decisions log and agent reports in the owning repository's tracked `+/_THREADS/<run>/` folder, thread working rules, owner reporting practices, authority footers and prompt skeleton that `ki agent` reads, the Wave E skill renames (`ki-pmo-design`, `ki-work-recurring` and `ki-pulse` under acquire) with their regenerated skill graph and map, `ki-checkpoint` Project threads named `<initiative>.<project>` with a `label`, central Granola capture routing, the five-rule `.ki.toml` layout checked by FILES-10, the flat `territory_name` and `territory_members` keys under `[skills.ki-repo]` with a finding for the retired `[skills.ki-repo.territory]` table, an optional roadmap README and `## Areas` section, bare `[skills.ki-trades]` tables while the trades hold stands, and a warning when that hold passes its review date.
- `ki docs overview` now reports the canonical `https://knowledgeislands.info/projects/ki/` route.
- Release guidance standardises exact installer pinning as positional `vX.Y.Z`, while an omitted version continues to resolve the latest release.
- Acquisition is action-first and adapter-driven from verified Harness skill declarations; Granola uses an allowlisted read-only MCP adapter, saturation-aware complete-history enumeration, separate detail and transcript checkpoints, atomic resumable journals, governed reset, explicit omissions, and post-acquisition dispositions. Central receivers accept several territory folders with one package per UUID, technical state outside captures, flag-only unmatched identities and empty folders, and retained checkpoints after handled capture removal.
- `ki bootstrap` and `ki bootstrap --refresh` keep an active canonical local development binding and link the core skills from its checkout instead of silently restoring the archive. A binding that cannot be kept, such as one whose checkout is missing, produces a `ki: warning:` naming the reason before the archive is restored and every configured canonical skill is re-pointed to it; archive restoration and `ki dev local off` now replace a development link whose checkout is gone.
- `.ki.toml` is the sole repository and Harness declaration filename across source checkouts, release archives, installed Harnesses, local development, repository discovery, and diagnostics; retired filenames have no compatibility or migration path.
- Direct-CWD mGit selection consumes unversioned direct-member `.mgit.toml` manifests and existing schema-one grouped manifests, including child-workspace recursion, without invoking `mgit`. Existing members without `.ki.toml` are skipped and named in audit output; invalid or empty KI selections still fail.
- `ki completion <shell>` emits Bash and Zsh scripts derived from the registered command tree, including nested commands, options, closed values, and local path completion.
- Root and nested help lead with usage and list commands alphabetically without task groups. The manual groups commands by purpose, including a separate Acquisition section. Completion candidates are alphabetical.
- VS Code sync previews removal of missing workspace folders and deletes projects with no remaining live folders when `--write` is supplied. Trusted folders are rebuilt from retained workspaces; missing registered checkouts are skipped without changing the registry.
- Root `help`, `completion`, `diag`, `doctor`, and `repair` follow the shared tool surface. The `manage` grouping is removed; capability search, missing, and outdated reports live under `harness`. Diagnostics are share-safe by default with local details behind `--full`; repair previews by default and requires `--apply` to write.
- Batch authority commands live under `ki repo batch` and use the parent repository selector. Each batch targets exactly one repository.
- Unknown command paths report the syntax error and current command usage without migration hints for retired names.
- `ki territory roots --territory <handle>` or `--estate` emits deterministic primary checkout roots, newline-delimited by default or NUL-delimited with `--null` (`-0`), after complete validation.
- `ki repo conform` stages safe writes until every initial audit passes, labels proposed and applied writes separately, and leaves proposed conform writes unapplied when an initial audit blocks publication.
- `ki repo roadmap list` is a framed horizon- and lifecycle-grouped text inventory with per-repository import and export trade context, including unadopted `triage` intake.
- `ki repo roadmap summary` reports per-repository item, horizon, and lifecycle counts without listing work-item details or reading trades.
- `ki repo roadmap` reads the v1 roadmap model: statuses add `triage` and `cancelled`, horizons are `now`, `next`, `soon`, `future` and `hold`, `theme` is optional, and `kind`, `purpose`, `project`, `initiative`, `component`, `hold` and `resolution` are validated. A `component` must be declared in `[skills.ki-work-roadmap].components`. Old horizons and fields, and an adopted open record without `kind`, still list as `legacy`. Text output and the summary order lanes `now` to `hold`, then triage, then done and cancelled, with `NOW=`, `CANCELLED=` and `LEGACY=` counts; `docs/roadmap/_IDEAS.md` and the roadmap folder's `README.md` index are not records. `--horizon` takes a comma-separated list or a repeated flag, such as `--horizon now,next`.
- `ki repo roadmap list --by project|initiative` groups text output through the Capital's `Streams/Projects/` and `Streams/Initiatives/` registry, reads the retired `Streams/Projects/Initiatives.md` index with a warning, and warns, without failing, when the registry is unavailable. `--by` implies `--aggregate`: groups span the selected set, the same Project from several repositories merges, a cross-territory Project is qualified with its territory's name, and Project groups show their registry `lifecycle`. `ki repo roadmap summary --by project|initiative|area` counts one row per group.
- `[skills.ki-work-roadmap.areas]` is read as a map from area code to title as well as the legacy bare list. `ki repo roadmap list --by area` groups text output by area under its title, and the JSON report adds `areaTitle`.
- Work-record area codes follow the Decision Record scope-segment grammar `[A-Z0-9]*[A-Z][A-Z0-9]*`, so a digit-leading code such as `5GE` is accepted and an all-digit code is rejected.
- `ki repo roadmap promote` and `demote` move along `now` to `hold` within the status's allowed horizons; entering `hold` needs `--reason` and `--condition`, and leaving it needs an explicit destination.
- `ki repo roadmap migrate` previews, and with `--apply` on one repository writes, the mechanical move of open records to the v1 model without committing.
- `ki repo roadmap prune` removes cancelled records as well as done ones, under the same committed-state guard and commit subject.
- `ki repo roadmap list --format json` emits the path-free `ki/roadmap/v1` contract with canonical record URLs.
- `ki repo roadmap list` and `summary` warn, without changing the exit status, on each KB Streams record field outside the shared record model and the `ki-repo-kb` note fields, as `<file>: unknown field <name>`; `priority` adds that horizon is the only priority signal. The JSON report lists them under each repository's `warnings`. A test pins the known set to the Harness `ki-repo-kb-streams` checker's lists.
- `ki repo roadmap` operations resolve a local roadmap only from the declared `[skills.ki-work]` adapter and its adapter table, never from a physical `docs/roadmap/` or `Streams/Roadmap/` directory; an unknown, inapplicable or tableless adapter is a usage error. Identifier-free `ki repo roadmap prune` skips repositories with no declared local roadmap or no roadmap root instead of failing.
- Roadmap text listings show compact external ticket keys and counts; `--links all` expands mappings into child entries with full task URLs and disambiguating identity details where needed.
- `ki registry list --format json` emits path-free `ki/registry/v1` identity and declaration metadata, including `repoType` as `project`, `kb`, or `null` when unavailable; `ki registry remove` removes exactly one keyed or path-selected entry with dry-run and transactional publication.
- `ki territory open <name> --target zed` adds the named owner last so Zed displays it first in the sidebar; canonical roots, the estate, and VS Code ordering are unchanged.
- `ki territory open` and `ki repo open` support Delta as a local target, opening each selected repository in the running app.
- `ki repo store scan` warns about undeclared conventional OneDrive source directories for selected repositories without creating or changing stores; `--estate` scans all registered repositories.
- `ki repo store absent` records in the machine-local registry (`absent_stores`) that this host does without a declared store. `store list` adds `availability` (`available`, `unavailable` with `reason`, `absent` or `missing`) to `ki/repository-stores/v1` and prints the fix for an unavailable or missing store; for a bound one, the absent route unbinds it first. `ki repo open` and `ki vscode sync` skip such a store with a warning instead of failing; `ki repo repair` names the fix and reports an absent store as information; `ki doctor` warns once per unavailable or missing registered store and counts `warn`; `store create` without the OneDrive root names both the bind and absent routes.
- An error with a known remedy prints it on a `next:` line after `ki: error:`: store mutations, the store-roles refusal, an invalid local registry, and repository selection that finds or matches nothing. A folder the host refuses (`EPERM` or `EACCES`) reads as `access denied`, with Full Disk Access as the macOS fix: a denied bound store is `unavailable` with that reason, `store create` and `store bind` refuse it, a denied conventional folder is not offered as a fix, and `ki estate converge` refuses its plan rather than skip a OneDrive folder it cannot scan. `store bind --write` prints its `undo:` command, the preview names the registry's absolute path, and each `ki repo store` help page says that repository selection is given to `ki repo`.
- Closed current batch records validate selected work from their evidence commit, so later pruning and expiry do not invalidate archival verification.
- `man/ki.commands.json` publishes the generated `ki/commands/v1` command and description inventory, reconciled against the manual and registered command tree.
- `ki repo init` writes `.ki.toml` in the house TOML layout: multiline arrays with trailing commas, a blank line before every table, and section banners.
- `ki repo init`, local `ki registry add`, `ki repo repair`, and `ki repo conform` record selected canonical KI repository identities in the machine-local registry without treating registration as a repair or conformance verdict; `ki repo conform` records before evaluating findings.
- `ki repo repair` reports a Knowledge Base's unbound or unavailable declared store as a `! Store:` warning instead of failing: it registers the repository when absent, projects its skills, and passes when nothing else is wrong. Commands that need the originals still fail clearly.
- `ki repo trade` is the sole trade command tree. Its parent `--repo`, `--territory`, and `--estate` selectors govern local and aggregate views; mutations require one registered repository. `ki repo trade routes list` is a framed local route inventory, while `ki repo --estate trade routes list` is a paired registered-estate table. Aggregate JSON uses the versioned, path-free `ki/trade-routes/v1` contract so applications can consume canonical route evidence without inheriting local registry topology or renderer-specific weights. The interactive D3 route map now belongs to `apps-observatory`; the retired `--html` and redundant `--table` flags are not retained as aliases.
- Trades are governed by the territory Capital. Every `.ki.toml` names its Capital in `[skills.ki-repo].capital`; the Capital declares its members in `territory_name` and `territory_members` under `[skills.ki-repo]`, refusing the retired `[skills.ki-repo.territory]` table, and the only routes, standing grants and knowledge subtypes in `[skills.ki-trades.territory]`. Member `[skills.ki-trades].routes` and `.subtypes` are retired and rejected, `routes add|remove`, `standing add|remove` and `subtypes` are removed, and an unavailable Capital fails closed with `territory policy lives in <capital>, not available here`. The Capital's `members` must be unique, include the Capital and be sorted by code point. `ki repo trade policy check` classifies members and `ki repo trade policy compare` checks active routes across the whole registry against a saved `ki/trade-routes/v1` report, rejecting a malformed baseline route. Aggregate views name each member skipped because its Capital is unavailable, with a `SKIPPED=n` count, and write those lines to stderr under `--format json`. The JSON contract is unchanged.
- Exact standing grants from the Capital policy, active/incomplete inspection, and receiver-local `STI-*` capture with full source-commit and path verification. Standing intake is knowledge-only, adds no peer-write or roadmap authority, and leaves ordinary itemised trades as the fallback.
- Trade kinds, observations, report statuses, diagnostics, and repository entities use a bounded named presentation registry. Layout punctuation remains local to each renderer, while terminal knowledge consistently renders as `ⓘ` and HTML uses the matching accessible Lucide Book Open mark.
- `ki repo trade prepare` creates a mutable local export once the Capital's policy grants the route; the receiver may observe it before `ki repo trade submit` freezes it, and `ki repo trade abandon --yes` removes it while it remains mutable. Both endpoints resolve the same Capital edge before a trade is active.
- Trade pairing compares the payload the sender authored — its field values as parsed and its prose — rather than raw bytes, so a receiver that formats its own Markdown does not read as having tampered with a record.
- `ki repo trade list` is a framed selected-repository inventory of preparations, outbound submissions, received imports, and imports awaiting local receipt, including their observation and cleanup state. `ki repo --estate trade list` aggregates the same view across registered repositories.
- `ki repo audit` and `ki repo conform` report the span in which a skill gathers its evidence, which precedes every criterion and on a subprocess-backed rubric is nearly the whole operation. The host names that span itself, so a session that emits nothing is still reported as gathering evidence rather than as a stalled item count; a session that takes the optional emitter refines it with its own named stages and steps.
- `ki repo audit --staged` and `--paths <path...>` scope the verdict without scoping the evaluation: every criterion still runs against the whole repository and every finding is rendered, but only a FAIL finding whose subject is a scoped path, a path under one, or a directory containing one fails the audit. `--staged` reads the Git index, deletions included; the frame names the scope, findings outside it are marked, and the summary leads with the scoped verdict and its `SCOPE:` counts.
- `ki repo audit` discloses criteria coverage beside every verdict as `CRITERIA: EVALUATED=<evaluated>/<mechanical> JUDGMENT=<judgment>`, so a pass with nothing to check no longer reads like a fully checked pass. A mechanical criterion counts as evaluated when it reports at least one outcome other than not-applicable; judgment criteria are counted but never assessed by the host.
- `ki dev skill rubric` resolves installed Harnesses rather than the current directory and names the resolved publication root; `--write` publishes only when that root and the current directory share a Git working tree, and otherwise refuses, naming both roots.
- `ki dev skill generate <skill>` imports the skill's `scripts/generate/index.ts`, renders its surfaces against the resolved Harness root and names each missing or stale one, failing until they are written; `--write` publishes only those surfaces, keeping an existing file's mode, under the same development-link and working-tree guard as `ki dev skill rubric`.
- Repository audit and conform now share a compact receipt stream and one mutable activity row. The bar indicates activity without estimating completion from item count or declared `cost`; evidence-ready skills receive one full receipt before collapsing to a timed evidence receipt, queued skills stay hidden, and the operation receipt retains total elapsed time. All-pass result trees end at the repository summary; per-skill results are retained only for WARN, FAIL, or FIXED outcomes. Conform labels a post-write pass `re-audit` and skips it with an explicit message when no write or command was staged.
- `.ki.toml` names each Harness once in `[repo]` and declares each governing skill by its bare name under `[skills]`, resolving that name against the declared Harness list rather than against whichever Harnesses happen to be installed. Harness-qualified skill keys are invalid; each provider owns a unique declared capability prefix. Trade routes are re-keyed by partner: one entry per peer carrying its `export` and `import` kinds, with a direction it does not trade simply absent. The previous fully-qualified top-level shape is not read: an unmigrated file fails naming the shape expected, with no dual parse or fallback.
- A configured private GitHub harness can opt into `auth = "github-cli"`: KI obtains a token through the authenticated GitHub CLI, sends it only to the matching commit-pinned codeload archive request, follows no redirects, and neither stores nor displays the credential.
- `ki dev local set` remembers each harness checkout in the host-local `$XDG_STATE_HOME/ki/locals.toml` instead of the portable `config.toml`. `config.toml` `[locals]` entries are moved there once by `ki dev local set` or `ki bootstrap`, then left untouched and ignored with a warning; `ki dev local on` refuses a remembered checkout that is missing on this host.
- `ki` writes `config.toml` only when a value it owns changes, editing just that statement in place, so `ki bootstrap`, the `[locals]` move, `ki dev local`, skill and agent changes and `ki harness install|uninstall` leave a chezmoi-managed file's comments, blank lines and array layout byte-identical; a file a text edit cannot safely change is laid out afresh, keeping every table `ki` does not own.
- Configured `[[harnesses.releases]]` entries, including their `auth` setting, survive every rewrite of the user configuration by bootstrap, refresh, local-development and skill-selection commands; diagnostics recognise the `auth` key.

### Documentation

- The user guides moved from `docs/guides/<name>.md` to `docs/guides/user/<name>.md` after `v0.4.0`, and the collection is now grouped by audience under `docs/guides/user/` and `docs/guides/developer/`. Links pinned to `v0.4.0` still resolve at the old paths; a link tracking the default branch does not, and a move is indistinguishable from a deletion to anything reading the old path. Repoint a citation at the `user/` path, or pin it to a tag.
- Practical instruction that previously deferred to `knowledgeislands.info` is now carried in this repository. New user guides cover first-time installation and `ki bootstrap`, the harness and skill capability lifecycle, repository target selection with audit and conform, maintaining a local installation, and the ChatGPT local-capture format.

### Distribution baseline

- `install.sh`
- `ki(1)`
