# Audit and conform repositories

Use this guide to run `ki repo` operations over one repository or many: choosing what gets selected, reading an audit result, applying a conform safely, and repairing what has drifted.

Two ideas carry the whole surface. **Selection happens before anything runs**, and a selector that resolves to nothing fails rather than quietly succeeding over an empty set. **Conform publishes nothing until every initial audit has passed**, so a repository with a failing audit gets no partial write.

## Select targets

Every `ki repo` and `ki registry` operation accepts the same three mutually exclusive selectors:

| Selector | Selects |
| --- | --- |
| `--repo <path-or-pattern>` | Literal paths or patterns, repeatable, resolved to physical KI repository roots in deterministic order |
| `--agora <name>` | The registered member repositories of one owner-declared Agora |
| `--estate` | Every locally registered canonical KI repository — shorthand for `--agora estate` |

```sh
ki repo audit --repo .
ki repo audit --repo '/path/to/workspaces/*' --concise
ki repo audit --estate --concise
```

An unmatched pattern, an invalid root, or a duplicate root stops the operation before any target runs, which is what makes a wide selector safe to use: you learn the selection is wrong before anything acts on it. A repeated Agora declaration id is rejected naming every declaring owner, so you can resolve the ambiguity rather than guess which one won.

With no explicit selector, `ki` reads a regular `.mgit.toml` schema-one manifest in the current directory. A workspace manifest selects its configured group and recurses through child workspaces, using structural member types for standard and nested `main/` checkouts and skipping bare stores; a repository manifest falls through to ordinary single-repository discovery. `ki` never invokes `mgit` to do this.

Operations then run in target order. A read-only operation isolates each target's diagnostic. A mutation retains earlier successful targets when a later one fails, and returns a non-zero overall result — so a multi-repository failure leaves completed work in place and tells you it was not complete.

### The registry

The machine-local registry at `$XDG_STATE_HOME/ki/registry.toml` is what `--agora` and `--estate` resolve against. Each keyed entry holds one canonical HTTPS GitHub identity and its checkout path:

```toml
schema = 1

[repositories."ki-agentic-harness"]
repository = "https://github.com/knowledgeislands/ki-agentic-harness"
path = "/Users/example/workspaces/knowledgeislands/ki-agentic-harness"
```

Record roots without applying any repair using `ki registry add --repo <path-or-pattern>`, and list them with `ki registry list`. `ki repo init`, `ki repo repair`, and `ki repo conform` also record each selected root — conform does so first, even when its later checks fail, so the registry stays an inventory for repair and bulk maintenance rather than a compliance badge.

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

`repair` records each selected physical root and then reconciles only missing, dangling, or stale KI-managed projections. It does not create declarations, change configuration, or touch anything it does not manage; `--dry-run` changes nothing. Use it when `ki repo diag` shows a declared skill whose local projection has gone missing — for instance after a harness moved.

`upgrade` refreshes the uniquely resolved providers declared by the selected repositories. It changes no skill activation in either scope. When a declared provider does not resolve uniquely, the upgrade reports it rather than choosing.

For the user-scope equivalents — updating the executable itself and repairing user skill links — see [maintain a local installation](local-installation.md).

## Verify

```sh
ki repo audit --repo . --concise
ki repo diag --repo .
```

A clean audit and a `diag` showing every declared skill projected is the end state. Exit status `0` means the selection resolved and every check passed; `1` means a check or operation failed; `2` means the command grammar or a selector was invalid.

## Recovery

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Selection fails naming an unmatched pattern | The pattern matches no physical KI root | Widen or correct the pattern; check `ki registry list` |
| Selection fails naming a duplicate root | Two selectors resolve to the same root | Remove the redundant `--repo` |
| `--agora` fails naming several owners | More than one owner declares that id | Resolve the ambiguity in the declaring repositories |
| Conform reports `proposed write` and stops | The initial audit failed for that repository | Fix the audit findings, then rerun conform |
| Conform says no re-audit was required | Nothing was staged | Expected; the initial pass is the whole result |
| A declared skill has no projection | The link is missing, dangling, or stale | `ki repo repair --dry-run`, review, then rerun |
| A multi-repository mutation exits non-zero | A later target failed after earlier ones succeeded | Read the per-repository result; earlier targets are already applied |

Exact grammar is in `ki repo <command> --help` and the tracked [ki(1) manual](../../../man/ki.1). The observable contracts are specified in [Repository audit](../../specs/repository-audit.md), [Repository operations](../../specs/repository-operations.md), and [Explicit repository registration](../../specs/registry.md).
