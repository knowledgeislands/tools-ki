# Audit and conform repositories

Use this guide to run `ki repo` operations over one repository or many: choosing what gets selected, reading an audit result, applying a conform safely, and repairing what has drifted.

Two ideas carry the whole surface. **Selection happens before anything runs**, and a selector that resolves to nothing fails rather than quietly succeeding over an empty set. **Conform publishes nothing until every initial audit has passed**, so a repository with a failing audit gets no partial write.

## Select targets

Use repeated `--repo <path-or-pattern>` for explicit physical roots. Use `-t, --territory <handle>` for a registered Capital's declared members, or `--estate` for every registered repository. These primary scopes are mutually exclusive. The optional Capital-only `territory_prefix` supplies the handle; without it use the Capital's local registry key.

Repeated `-f, --filter <prefix>` arguments narrow directory basenames literally and case-sensitively with OR semantics. Filter alone narrows the native current-repository or direct-CWD mGit workspace default. Filtering happens before nested worktree expansion; empty prefixes and no matches fail.

Territory registration must be complete before filtering. Selected roots must be physical KI checkouts matching their registered identity and declared Capital. A registered unavailable root excluded by a filter does not block the remaining operation. See [territory selection](territory-selection.md) for the atomic roots interface and local projection tools.

```sh
ki repo audit --repo .
ki repo -t ki -f tools- audit --concise
ki repo audit --estate --concise
```

An unmatched pattern, an invalid root, or a duplicate root stops the operation before any target runs, which is what makes a wide selector safe to use: you learn the selection is wrong before anything acts on it.

With no explicit selector, `ki` reads a regular `.mgit.toml` manifest in the current directory. A workspace manifest without a schema selects its direct members and recurses through child workspaces, using member types for standard and nested `main/` checkouts and skipping bare stores. Existing `schema = 1` grouped manifests remain readable with their configured default group. A repository manifest falls through to ordinary single-repository discovery. `ki` never invokes `mgit` to do this.

An mGit member whose checkout exists but has no `.ki.toml` is skipped. `ki repo audit` reports its name, including with `--concise`. Missing or unsafe checkouts, unsafe or invalid KI declarations, and a workspace with no KI repositories still fail.

Operations then run in target order. A read-only operation isolates each target's diagnostic. A mutation retains earlier successful targets when a later one fails, and returns a non-zero overall result — so a multi-repository failure leaves completed work in place and tells you it was not complete.

### The registry

The machine-local registry at `$XDG_STATE_HOME/ki/registry.toml` is what `--territory` and `--estate` resolve against. Each keyed entry holds one canonical HTTPS GitHub identity and its checkout path:

```toml
schema = 1

[repositories."ki-agentic-harness"]
repository = "https://github.com/knowledgeislands/ki-agentic-harness"
path = "/Users/example/workspaces/knowledgeislands/ki-agentic-harness"
```

Record roots without applying any repair using `ki registry add --repo <path-or-pattern>`, and list them with `ki registry list`. Use `ki registry list --format json` for the path-free `ki/registry/v1` projection of canonical identity and declared metadata. Each entry has `repoType`: `project` or `kb` when available, and `null` when unavailable. Remove exactly one entry by key with `ki registry remove <key>`, or by its exact path with `ki registry remove --repo <path>`; add `--dry-run` to preview either removal. Bulk selectors are deliberately unavailable for removal.

`ki repo init`, `ki repo repair`, and `ki repo conform` also record each selected root — conform does so first, even when its later checks fail, so the registry stays an inventory for repair and bulk maintenance rather than a compliance badge. Trade commands also use the registry to locate the territory Capital named by each repository's `[skills.ki-repo].capital`; register the Capital's checkout on every machine that inspects or exchanges trades, or they fail with `territory policy lives in <capital>, not available here`.

## Manage declared stores

A Knowledge Base declares stable store roles in `.ki.toml`; your machine binds external roles separately. Inspect one repository or a selected set:

```sh
ki repo store list
ki repo --estate store list --format json
```

To find conventional OneDrive `sources-<repository-basename>` directories that have no declared `sources` role, scan the current repository or selected estate:

```sh
ki repo store scan
ki repo --estate store scan
```

The scan includes Projects as well as Knowledge Bases. It warns about undeclared directories and suggests a declaration, migration, or retirement decision; it never changes the directory or binding. Unsafe store paths and unreadable declarations return a non-zero diagnostic.

`notes` is always the repository root and cannot be rebound. Bind an existing `sources` or `legacy` directory by previewing first, then writing the machine-local registry:

```sh
ki repo store bind sources /absolute/path/to/sources
ki repo store bind sources /absolute/path/to/sources --write
ki repo store unbind sources
ki repo store unbind sources --write
```

Unbinding never deletes store content. For the established opt-in OneDrive source location, `ki repo store create sources` previews `sources-<repository-basename>` and `--write` creates and binds it. `legacy` has no automatic creation policy; bind its existing directory explicitly. Do not use stores for credentials.

## Run an audit

```sh
ki repo audit --repo .
ki repo audit --repo . --skill ki-guides
ki repo audit --estate --concise --progress never
```

Without `--skill`, the audit runs every skill the repository declares under `[skills]` in its `.ki.toml`. With `--skill`, it runs exactly one declared, resolved skill — the fastest loop while you are repairing a single concern. Naming a skill the repository does not declare, or whose provider does not resolve, is an error rather than a silent skip.

An audit exits non-zero when any selected repository reports a failure. On a terminal it renders a compact receipt stream with one moving activity row; that bar means work is happening and deliberately does not estimate completion from item count or declared cost. An all-pass run ends at the summary, and detailed per-skill rows appear only for WARN, FAIL, or FIXED outcomes.

Three output controls are worth knowing:

- `--concise` renders only one final summary per repository. Use it for scripted or estate-wide runs.
- `--progress never` suppresses the activity stream. Use it whenever output is captured rather than watched.
- `--reporter-levels` selects which findings render; the default is `FAIL,WARN`.

Redirected output with `--progress always` defaults to the single-row form, and `--progress-style single` requests it explicitly.

## Conform, and what it will not do

```sh
ki repo conform --repo . --dry-run
ki repo conform --repo .
```

Conform collects safe write proposals for each selected repository and completes **every** initial audit before publishing any of them. A failing initial audit aborts that repository's publication entirely — no proposed write is applied. Read the verbs in its output, because they are precise:

| Output says | Meaning |
| --- | --- |
| `proposed write` | The write is staged and nothing has been applied |
| `applied write` | The staged set was published |
| `would apply write` | `--dry-run`: the staged set validated, and nothing was mutated |

Conform labels its second rubric pass `re-audit`, because it repeats the audit after staged writes or commands land. When nothing is staged it says so and stops after the initial pass.

Always run `--dry-run` first on a repository you have not conformed before. The publication boundary protects you from a partial write within one repository; it does not cover the independent registry update, later selected repositories, subprocess conforms, or rollback once publication has begun.

`ki repo educate --repo .` explains the maintenance each declared skill expects, and changes nothing. It is the right command when an audit finding names a standard you have not met before.

## Repair and upgrade

```sh
ki repo repair --repo . --dry-run
ki repo repair --repo .
ki repo upgrade --repo .
```

`repair` records each selected physical root and then reconciles only missing, dangling, or stale KI-managed projections, and removes a dangling `ki-` link that no declared skill accounts for, such as one left by a retired skill. It does not create declarations, change configuration, or touch anything it does not manage; `--dry-run` changes nothing. Use it when `ki repo diag` shows a declared skill whose local projection has gone missing — for instance after a harness moved.

`upgrade` refreshes the uniquely resolved providers declared by the selected repositories. It changes no skill activation in either scope. When a declared provider does not resolve uniquely, the upgrade reports it rather than choosing.

For the user-scope equivalents — updating the executable itself and repairing user skill links — see [maintain a local installation](local-installation.md).

## Verify

```sh
ki repo audit --repo . --concise
ki repo diag --repo .
```

A clean audit and a `diag` showing every declared skill projected is the end state. Exit status `0` means the selection resolved and every check passed; `1` means a check or operation failed; `2` means the command grammar or a selector was invalid.

## Recovery

- Selection fails naming an unmatched pattern — Likely cause: The pattern matches no physical KI root. Action: Widen or correct the pattern; check `ki registry list`.

- Selection fails naming a duplicate root — Likely cause: Two selectors resolve to the same root. Action: Remove the redundant `--repo`.

- `--territory` fails with a handle declared more than once — Likely cause: Two registered Capitals resolve to the same handle, from a `territory_prefix` or a registry key. Action: Rename the prefix or registry key so each handle is unique.

- Conform reports `proposed write` and stops — Likely cause: The initial audit failed for that repository. Action: Fix the audit findings, then rerun conform.

- Conform says no re-audit was required — Likely cause: Nothing was staged. Action: Expected; the initial pass is the whole result.

- A declared skill has no projection — Likely cause: The link is missing, dangling, or stale. Action: `ki repo repair --dry-run`, review, then rerun.

- A multi-repository mutation exits non-zero — Likely cause: A later target failed after earlier ones succeeded. Action: Read the per-repository result; earlier targets are already applied.

Exact grammar is in `ki repo <command> --help` and the installed `man ki` manual. Selection must resolve at least one physical repository, audit is read-only, and conform publishes only after the selected repository's initial audit passes.
