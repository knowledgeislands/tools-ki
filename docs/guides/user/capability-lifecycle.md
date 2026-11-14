# Install backpacks and activate their skills

Use this guide when you need a capability that is not yet available — a skill an agent should carry, or a governing skill a repository should declare. It covers where capabilities come from, the difference between installing and activating one, and how to withdraw either.

The distinction that matters throughout: **installing a backpack makes its capabilities available; it does not turn any of them on.** Activation is a separate, explicit act, and it happens in one of two scopes. Every command below respects that boundary, which is why installing a backpack never silently changes what your agent can do.

## The two activation scopes

- User — Command: `ki skill add <skill>`. Effect: Links the skill into the configured agent skill directories for this machine's user.

- Repository — Command: `ki repo skill add <skill>`. Effect: Links the skill into the repository and declares it under `[skills]` in that repository's `.ki.toml`.

User activation is machine-local and travels with you. Repository activation travels with the repository: the `.ki.toml` declaration is the durable statement, and the link is its local projection. That is why `ki repo repair` can rebuild a repository's projections from its declaration, and why cloning a governed repository on a new machine needs only the backpack installed, not a re-run of `ki repo skill add`.

Both forms activate only where the runtimes agree. User activation applies a skill only to configured agents compatible with it; repository activation validates the selected repository and the intersection of repository and skill runtimes before linking or declaring anything. A skill bound to a runtime you do not have configured is skipped rather than half-linked.

## Install a backpack

```sh
ki backpack list
ki backpack install example/backpack
ki backpack info example/backpack
```

`install` fetches one configured compatible backpack, verifies its immutable archive, and unpacks only recognised payload directories. `info` then shows its capability inventory without changing user state, which is the quickest way to learn what a backpack actually offers before you activate anything from it.

A backpack declares its stable capability namespace in its own root `.ki.toml` — for example `[skills.ki-repo-backpack]` with `prefix = "ki"`. Every skill it publishes uses that prefix, and `ki` refuses to install a second backpack claiming a prefix that is already owned. Distinct prefixes such as `ki` and `hnr` coexist happily; two backpacks competing for one prefix do not, and the refusal is the point — it keeps `ki-plan` unambiguous about which backpack supplies it.

### Private GitHub archives

A private backpack archive can use your local GitHub CLI credential instead of a token in configuration. Declare the commit-pinned codeload URL, its SHA-256, and the auth mode:

```toml
[[backpacks.releases]]
id = "example/private-backpack"
url = "https://codeload.github.com/example/private-backpack/tar.gz/<commit-sha>"
sha256 = "<archive-sha256>"
auth = "github-cli"
```

Authenticate the CLI first with `gh auth login`. `ki` then runs `gh auth token` only for that exact codeload URL, sends the result only as the HTTPS authorization header of that one request, follows no redirects, and neither stores nor prints the token. `auth = "github-cli"` is accepted only alongside a matching commit-pinned `https://codeload.github.com/<owner>/<repository>/tar.gz/<revision>` URL, so it cannot be pointed at an arbitrary host. A public archive needs no `auth` field and never invokes `gh`.

## Activate a capability

Find what is available, then turn on what you need:

```sh
ki inventory
ki backpack search roadmap
ki skill add ki-work
```

`ki inventory` inventories installed backpack capabilities and declared skills; `ki backpack search` matches a query case-insensitively against backpack identifier, capability kind, and capability name. Neither consults a network or discovers a repository, so both are safe to run anywhere.

For a repository, activate from inside it or select it explicitly:

```sh
ki repo skill add ki-guides --repo /path/to/repository
ki repo diag --repo /path/to/repository
```

The `diag` confirms the declaration and its projection agree. If the declaration is present but the projection is missing or stale, that is a repair job rather than a re-activation — see [repository operations](repository-operations.md).

Use `ki backpack missing` to find the opposite condition: a capability you have asked for that has no installed provider. That report tells you which backpack you still need to install.

## Withdraw a capability

Deactivate before you uninstall. The commands enforce that order for you:

```sh
ki repo skill remove ki-guides --repo /path/to/repository
ki skill remove ki-work
ki backpack uninstall example/backpack
```

`uninstall` removes one non-canonical backpack with only recognised payload directories, and removes its identifier from `[backpacks].ids`. It refuses to remove the canonical backpack, and it refuses to remove any backpack still supplying active user skills — so a refusal here means a `ki skill remove` is still outstanding, not that the command is broken.

`ki backpack reinstall <backpack-id>` replaces one inactive installed backpack with a verified archive. It applies the same protection: a backpack supplying active user skills is refused, and a development-linked backpack must first be restored with `ki dev local off <backpack-id>`.

Both `ki skill remove` and `ki repo skill remove` refuse to remove a managed-skill directory they do not own. A foreign directory at a managed path is reported rather than deleted.

## Verify

```sh
ki doctor
ki repo diag --repo /path/to/repository
```

`doctor` checks user configuration, agent skill directories, installed backpacks, and skill links, and exits non-zero on a failing check. `repo diag` reports the repository's declared skills against their local projections.

## Recovery

- Install refuses, naming a claimed prefix — Likely cause: Another installed backpack already owns that capability prefix. Action: Uninstall the competing backpack, or use a backpack with a distinct prefix.

- Uninstall refuses, naming active skills — Likely cause: Skills from that backpack are still activated. Action: Run `ki skill remove` for each, then uninstall.

- Reinstall refuses a development-linked backpack — Likely cause: The backpack is served from a local checkout. Action: Run `ki dev local off <backpack-id>` first.

- `gh auth token` fails during a private install — Likely cause: The GitHub CLI is not authenticated for that account. Action: Run `gh auth login`, then retry the install.

- A skill is declared but not projected — Likely cause: The link is missing, dangling, or stale. Action: `ki repo repair --dry-run`, review, then rerun without the flag.

- `ki backpack missing` names a capability — Likely cause: No installed backpack provides it. Action: Install the providing backpack, then activate the skill.

Exact grammar for every command here is in `ki <command> --help` and the installed `man ki` manual. Installation never activates a skill, activation never installs a provider, and repair reconciles only the scope it reports.
