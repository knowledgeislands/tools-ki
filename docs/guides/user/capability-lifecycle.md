# Install harnesses and activate their skills

Use this guide when you need a capability that is not yet available — a skill an agent should carry, or a governing skill a repository should declare. It covers where capabilities come from, the difference between installing and activating one, and how to withdraw either.

The distinction that matters throughout: **installing a harness makes its capabilities available; it does not turn any of them on.** Activation is a separate, explicit act, and it happens in one of two scopes. Every command below respects that boundary, which is why installing a harness never silently changes what your agent can do.

## The two activation scopes

| Scope | Command | Effect |
| --- | --- | --- |
| User | `ki skill add <skill>` | Links the skill into the configured agent skill directories for this machine's user |
| Repository | `ki repo skill add <skill>` | Links the skill into the repository and declares it under `[skills]` in that repository's `.ki.toml` |

User activation is machine-local and travels with you. Repository activation travels with the repository: the `.ki.toml` declaration is the durable statement, and the link is its local projection. That is why `ki repo repair` can rebuild a repository's projections from its declaration, and why cloning a governed repository on a new machine needs only the harness installed, not a re-run of `ki repo skill add`.

Both forms activate only where the runtimes agree. User activation applies a skill only to configured agents compatible with it; repository activation validates the selected repository and the intersection of repository and skill runtimes before linking or declaring anything. A skill bound to a runtime you do not have configured is skipped rather than half-linked.

## Install a harness

```sh
ki harness list
ki harness install example/harness
ki harness info example/harness
```

`install` fetches one configured compatible harness, verifies its immutable archive, and unpacks only recognised payload directories. `info` then shows its capability inventory without changing user state, which is the quickest way to learn what a harness actually offers before you activate anything from it.

A harness declares its stable capability namespace in its own root `.ki.toml` — for example `[skills.ki-repo-harness]` with `prefix = "ki"`. Every skill it publishes uses that prefix, and `ki` refuses to install a second harness claiming a prefix that is already owned. Distinct prefixes such as `ki` and `hnr` coexist happily; two harnesses competing for one prefix do not, and the refusal is the point — it keeps `ki-plan` unambiguous about which harness supplies it.

### Private GitHub archives

A private harness archive can use your local GitHub CLI credential instead of a token in configuration. Declare the commit-pinned codeload URL, its SHA-256, and the auth mode:

```toml
[[harnesses.releases]]
id = "example/private-harness"
url = "https://codeload.github.com/example/private-harness/tar.gz/<commit-sha>"
sha256 = "<archive-sha256>"
auth = "github-cli"
```

Authenticate the CLI first with `gh auth login`. `ki` then runs `gh auth token` only for that exact codeload URL, sends the result only as the HTTPS authorization header of that one request, follows no redirects, and neither stores nor prints the token. `auth = "github-cli"` is accepted only alongside a matching commit-pinned `https://codeload.github.com/<owner>/<repository>/tar.gz/<revision>` URL, so it cannot be pointed at an arbitrary host. A public archive needs no `auth` field and never invokes `gh`.

## Activate a capability

Find what is available, then turn on what you need:

```sh
ki manage list
ki manage search roadmap
ki skill add ki-plan
```

`ki manage list` inventories installed harness capabilities and declared skills; `ki manage search` matches a query case-insensitively against harness identifier, capability kind, and capability name. Neither consults a network or discovers a repository, so both are safe to run anywhere.

For a repository, activate from inside it or select it explicitly:

```sh
ki repo skill add ki-guides --repo /path/to/repository
ki repo diag --repo /path/to/repository
```

The `diag` confirms the declaration and its projection agree. If the declaration is present but the projection is missing or stale, that is a repair job rather than a re-activation — see [repository operations](repository-operations.md).

Use `ki manage missing` to find the opposite condition: a capability you have asked for that has no installed provider. That report tells you which harness you still need to install.

## Withdraw a capability

Deactivate before you uninstall. The commands enforce that order for you:

```sh
ki repo skill remove ki-guides --repo /path/to/repository
ki skill remove ki-plan
ki harness uninstall example/harness
```

`uninstall` removes one non-canonical harness with only recognised payload directories, and removes its identifier from `[harnesses].ids`. It refuses to remove the canonical harness, and it refuses to remove any harness still supplying active user skills — so a refusal here means a `ki skill remove` is still outstanding, not that the command is broken.

`ki harness reinstall <harness-id>` replaces one inactive installed harness with a verified archive. It applies the same protection: a harness supplying active user skills is refused, and a development-linked harness must first be restored with `ki dev local off <harness-id>`.

Both `ki skill remove` and `ki repo skill remove` refuse to remove a managed-skill directory they do not own. A foreign directory at a managed path is reported rather than deleted.

## Verify

```sh
ki manage doctor
ki repo diag --repo /path/to/repository
```

`doctor` checks user configuration, agent skill directories, installed harnesses, and skill links, and exits non-zero on a failing check. `repo diag` reports the repository's declared skills against their local projections.

## Recovery

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Install refuses, naming a claimed prefix | Another installed harness already owns that capability prefix | Uninstall the competing harness, or use a harness with a distinct prefix |
| Uninstall refuses, naming active skills | Skills from that harness are still activated | Run `ki skill remove` for each, then uninstall |
| Reinstall refuses a development-linked harness | The harness is served from a local checkout | Run `ki dev local off <harness-id>` first |
| `gh auth token` fails during a private install | The GitHub CLI is not authenticated for that account | Run `gh auth login`, then retry the install |
| A skill is declared but not projected | The link is missing, dangling, or stale | `ki repo repair --dry-run`, review, then rerun without the flag |
| `ki manage missing` names a capability | No installed harness provides it | Install the providing harness, then activate the skill |

Exact grammar for every command here is in `ki <command> --help` and the installed `man ki` manual. Installation never activates a skill, activation never installs a provider, and repair reconciles only the scope it reports.
