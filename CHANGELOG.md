# Changelog

This is the consolidated Pre-1.0 baseline for KI's current command surface and notable changes. It is updated as the tool evolves rather than divided into 0.x release entries. Tags, GitHub releases, and commit history identify exact 0.x snapshots.

## Pre-1.0 baseline

This baseline describes the `v0.6.1` release. Domain imports and extracted type leaves keep the dependency graph acyclic, enforced by a resolved-graph boundary gate with a supported isolated compiler and deliberate failure fixtures.

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

#### Agora management

- `ki agora list`
- `ki agora audit [agora]`
- `ki agora inspect <agora> --target <zed|vscode> --workspace <selector>`
- `ki agora show <agora> [--verbose]`
- `ki agora roots <agora> [--null]`
- `ki agora open <agora> --target <zed|vscode|delta>`
- `ki agora reference set <repository> <checkout> [--dry-run]`
- `ki agora reference list`
- `ki agora reference remove <repository> [--dry-run]`

#### Repository options

- `ki repo --repo <path-or-pattern>`
- `ki repo --agora <name>`
- `ki repo --estate`

#### Repository management

- `ki repo init`
- `ki repo open --target <zed|vscode|delta> [--stores|--no-stores]`
- `ki repo store list [--format <text|json>]`
- `ki repo store scan`
- `ki repo store create <sources> [--write]`
- `ki repo store bind <sources|legacy> <absolute-path> [--write]`
- `ki repo store unbind <sources|legacy> [--write]`
- `ki repo audit`
- `ki repo conform`
- `ki repo diag`
- `ki repo roadmap list [--format <text|json>] [--links <compact|all>]`
- `ki repo roadmap summary`
- `ki repo roadmap stats [--stale-after <duration>] [--format <text|json>]`
- `ki repo roadmap prune [id]`
- `ki repo roadmap promote <id> [horizon]`
- `ki repo roadmap demote <id> [horizon]`
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

- `ki repo trade routes add`
- `ki repo trade routes remove`
- `ki repo trade routes list [--incomplete] [--format text|json]` (`--estate` for an aggregate)
- `ki repo trade routes check`
- `ki repo trade subtypes add|list|remove`
- `ki repo trade standing add|list|check|remove`
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
- `ki acquire status [--adapter <name>|--all] [--repo <path>]`
- `ki acquire reconcile [--adapter <name>|--all] [--repo <path>]`
- `ki acquire reset [--adapter <name>] [--repo <path>] [--source <identity>] [--component <name>] [--rebuild] [--confirm]`

#### Development

- `ki dev local set <harness-id> <local-harness-path>`
- `ki dev local on [harness-id]`
- `ki dev local off [harness-id]`
- `ki dev skill rubric`

### Behaviours

- Diagnostics and doctor reports share tool/version, checkout-verified local/release/unknown installation mode, executing platform/architecture, runtime/version, and configuration state. Copied or unidentified source is unknown rather than guessed local. Doctor reports its read-only scope, verdict, and pass/warn/fail/skipped counts without implying package freshness.
- KI's own CI runs from the checked-out source, while release packaging pins a verified Harness revision.
- The canonical Harness pin is `ki-agentic-harness` `f0af2d1`. Its rubrics parse YAML with Bun's built-in parser, so the compiled executable imports every rubric catalogue, and its engineering CI rule requires a separate `bun run test` step only for tests the audit does not run itself.
- `ki docs overview` now reports the canonical `https://knowledgeislands.info/projects/ki/` route.
- Release guidance standardises exact installer pinning as positional `vX.Y.Z`, while an omitted version continues to resolve the latest release.
- Acquisition is action-first and adapter-driven from verified Harness skill declarations; Granola uses an allowlisted read-only MCP adapter, saturation-aware complete-history enumeration, separate detail and transcript checkpoints, atomic resumable journals, governed reset, explicit omissions, and post-acquisition dispositions.
- `.ki.toml` is the sole repository and Harness declaration filename across source checkouts, release archives, installed Harnesses, local development, repository discovery, and diagnostics; retired filenames have no compatibility or migration path.
- Direct-CWD mGit selection consumes unversioned direct-member `.mgit.toml` manifests and existing schema-one grouped manifests, including child-workspace recursion, without invoking `mgit`. Existing members without `.ki.toml` are skipped and named in audit output; invalid or empty KI selections still fail.
- `ki completion <shell>` emits Bash and Zsh scripts derived from the registered command tree, including nested commands, options, closed values, and local path completion.
- Root and nested help lead with usage and list commands alphabetically without task groups. The manual groups commands by purpose, including a separate Acquisition section. Completion candidates are alphabetical.
- VS Code sync previews removal of missing workspace folders and deletes projects with no remaining live folders when `--write` is supplied. Trusted folders are rebuilt from retained workspaces; missing registered checkouts are skipped without changing the registry.
- Root `help`, `completion`, `diag`, `doctor`, and `repair` follow the shared tool surface. The `manage` grouping is removed; capability search, missing, and outdated reports live under `harness`. Diagnostics are share-safe by default with local details behind `--full`; repair previews by default and requires `--apply` to write.
- Batch authority commands now live under `ki repo batch` and use the parent repository selector; `ki batch` is retired. Each batch still targets exactly one repository.
- Registered Agora owners declare a required single-line `title`, direct members and optional one-level inclusions of another Agora or repository. `ki agora list` and `ki agora show` present the title; the identifier remains the only selector and machine key, and a missing or malformed title fails resolution. Ordinary members need no Agora declaration. The reserved `estate` selector derives the full locally registered canonical repository set for selection and editor opening.
- `ki agora roots <agora>` exposes a stable machine interface for resolved registered Agora roots: newline-delimited by default, or NUL-delimited with `--null` (`-0`).
- `ki repo conform` stages safe writes until every initial audit passes, labels proposed and applied writes separately, and leaves proposed conform writes unapplied when an initial audit blocks publication.
- `ki repo roadmap list` is a framed horizon- and lifecycle-grouped text inventory with per-repository import and export trade context, including unadopted `triage` intake.
- `ki repo roadmap summary` reports per-repository item, horizon, and lifecycle counts without listing work-item details or reading trades.
- `ki repo roadmap list --format json` emits the path-free `ki/roadmap/v1` contract with canonical record URLs.
- `ki repo roadmap` operations resolve a local roadmap only from the declared `[skills.ki-work]` adapter and its adapter table, never from a physical `docs/roadmap/` or `Streams/Roadmap/` directory; an unknown, inapplicable or tableless adapter is a usage error. Identifier-free `ki repo roadmap prune` skips repositories with no declared local roadmap or no roadmap root instead of failing.
- Roadmap text listings show compact external ticket keys and counts; `--links all` expands mappings into child entries with full task URLs and disambiguating identity details where needed.
- `ki registry list --format json` emits path-free `ki/registry/v1` identity and declaration metadata, including `repoType` as `project`, `kb`, or `null` when unavailable; `ki registry remove` removes exactly one keyed or path-selected entry with dry-run and transactional publication.
- `ki agora list` and `ki agora show` separate a named Agora's owner, direct members, and inclusions, while the system estate counts registered repositories without an owner. Roots are deduplicated and sorted alphabetically by registry key.
- `ki agora open <name> --target zed` adds the named owner last so Zed displays it first in the sidebar; canonical roots, the estate, and VS Code ordering are unchanged.
- `ki agora open` and `ki repo open` support Delta as a local target, opening each selected repository in the running app.
- `ki repo store scan` warns about undeclared conventional OneDrive source directories for selected repositories without creating or changing stores; `--estate` scans all registered repositories.
- Closed current batch records validate selected work from their evidence commit, so later pruning and expiry do not invalidate archival verification.
- `man/ki.commands.json` publishes the generated `ki/commands/v1` command and description inventory, reconciled against the manual and registered command tree.
- `ki repo init`, local `ki registry add`, `ki repo repair`, and `ki repo conform` record selected canonical KI repository identities in the machine-local registry without treating registration as a repair or conformance verdict; `ki repo conform` records before evaluating findings.
- `ki repo trade` is the sole trade command tree. Its parent `--repo`, `--agora`, and `--estate` selectors govern local and aggregate views; mutations require one registered repository. `ki repo trade routes list` is a framed local route inventory, while `ki repo --estate trade routes list` is a paired registered-estate table. Aggregate JSON uses the versioned, path-free `ki/trade-routes/v1` contract so applications can consume canonical route evidence without inheriting local registry topology or renderer-specific weights. The interactive D3 route map now belongs to `apps-observatory`; the retired `--html` and redundant `--table` flags are not retained as aliases.
- Receiver-owned knowledge subtype commands, exact two-sided standing import/export grants, active/incomplete inspection, and receiver-local `STI-*` capture with full source-commit and path verification. Standing intake is knowledge-only, adds no peer-write or roadmap authority, and leaves ordinary itemized trades as the fallback.
- Trade kinds, observations, report statuses, diagnostics, and repository entities use a bounded named presentation registry. Layout punctuation remains local to each renderer, while terminal knowledge consistently renders as `ⓘ` and HTML uses the matching accessible Lucide Book Open mark.
- `ki repo trade prepare` creates a mutable local export once this repository declares the route; the receiver may observe it before `ki repo trade submit` freezes it, and `ki repo trade abandon --yes` removes it while it remains mutable. Receiver activation remains reciprocal.
- Trade pairing compares the payload the sender authored — its field values as parsed and its prose — rather than raw bytes, so a receiver that formats its own Markdown does not read as having tampered with a record.
- `ki repo trade list` is a framed selected-repository inventory of preparations, outbound submissions, received imports, and imports awaiting local receipt, including their observation and cleanup state. `ki repo --estate trade list` aggregates the same view across registered repositories.
- `ki repo audit` and `ki repo conform` report the span in which a skill gathers its evidence, which precedes every criterion and on a subprocess-backed rubric is nearly the whole operation. The host names that span itself, so a session that emits nothing is still reported as gathering evidence rather than as a stalled item count; a session that takes the optional emitter refines it with its own named stages and steps.
- Repository audit and conform now share a compact receipt stream and one mutable activity row. The bar indicates activity without estimating completion from item count or declared `cost`; evidence-ready skills receive one full receipt before collapsing to a timed evidence receipt, queued skills stay hidden, and the operation receipt retains total elapsed time. All-pass result trees end at the repository summary; per-skill results are retained only for WARN, FAIL, or FIXED outcomes. Conform labels a post-write pass `re-audit` and skips it with an explicit message when no write or command was staged.
- `.ki.toml` names each Harness once in `[repo]` and declares each governing skill by its bare name under `[skills]`, resolving that name against the declared Harness list rather than against whichever Harnesses happen to be installed. Harness-qualified skill keys are invalid; each provider owns a unique declared capability prefix. Trade routes are re-keyed by partner: one entry per peer carrying its `export` and `import` kinds, with a direction it does not trade simply absent. The previous fully-qualified top-level shape is not read: an unmigrated file fails naming the shape expected, with no dual parse or fallback.
- A configured private GitHub harness can opt into `auth = "github-cli"`: KI obtains a token through the authenticated GitHub CLI, sends it only to the matching commit-pinned codeload archive request, follows no redirects, and neither stores nor displays the credential.

### Documentation

- The user guides moved from `docs/guides/<name>.md` to `docs/guides/user/<name>.md` after `v0.4.0`, and the collection is now grouped by audience under `docs/guides/user/` and `docs/guides/developer/`. Links pinned to `v0.4.0` still resolve at the old paths; a link tracking the default branch does not, and a move is indistinguishable from a deletion to anything reading the old path. Repoint a citation at the `user/` path, or pin it to a tag.
- Practical instruction that previously deferred to `knowledgeislands.info` is now carried in this repository. New user guides cover first-time installation and `ki bootstrap`, the harness and skill capability lifecycle, repository target selection with audit and conform, maintaining a local installation, and the ChatGPT local-capture format.

### Distribution baseline

- `install.sh`
- `ki(1)`
