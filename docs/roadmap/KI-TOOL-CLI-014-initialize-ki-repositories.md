---
id: KI-TOOL-CLI-014
title: Initialize KI repositories
theme: cli
horizon: blocking
status: ready
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Add `ki repo init` as the supported one-command way to make an existing Git repository a KI repository. Today a repository becomes addressable only after a user manually authors `.ki-config.toml`; the recently added `ki repo register` can remember an already declared repository, but cannot create its declaration. Initialization must create an explicit `ki-repo` identity and register the resulting physical repository locally.

## Boundary

This item does not run `git init`, infer a repository declaration from ambient files, overwrite or repair an existing `.ki-config.toml`, activate arbitrary repository skills, or create a workspace. It initializes exactly one existing physical Git repository and keeps later skill activation explicit through `ki repo skill add`.

## Current state

`ki repo` target selection requires a regular `.ki-config.toml`. The `ki-repo` declaration now carries repository title, description, `repo_code`, supported runtimes, and visibility. `ki repo register` persists a locally selected repository only after that declaration already exists. There is no `init` subcommand or documented bootstrap path for this first declaration.

## Steps

1. Define `ki repo init` grammar for an existing repository and its required explicit identity metadata: title, description, `repo_code`, supported runtimes, and visibility. Provide a deterministic non-interactive form and a clear interactive acquisition path where supported.
2. Resolve and physically validate the target Git repository without relying on `.ki-config.toml`; refuse a missing, non-Git, symbolic-link, or already-declared target before any write.
3. Atomically create the minimal valid `.ki-config.toml` containing the `ki-repo` declaration, then attempt to register the physical repository through the local repository-registry contract before any later initialization work. If registration cannot complete, leave neither a misleading partial local registration nor an ambiguous declaration outcome.
4. Add CLI-contract tests for successful initialization, explicit metadata rendering, repeated invocation, invalid metadata, non-repository targets, existing declaration protection, and registration failure recovery.
5. Update command help, completions, the manual, README, and changelog to make `ki repo init` the documented new-repository entry point.

## Files touched

- `src/commands/repository-operations.ts`
- `src/core/repository.ts`
- `src/core/configuration.ts`
- `src/agents/configuration.ts`
- `src/tests/cli/repository-registry.test.ts`
- command inventory and completion tests
- `README.md`
- `man/ki.1`
- `CHANGELOG.md`

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --skill ki-roadmap --repo .`

## Dependencies / blocks

This is a Blocking repository-onboarding gap with no work-item dependency. It does not block the independent workspace, bootstrap, or parser-diagnostic items, but it should take precedence when a user cannot create a KI declaration through the public CLI.

## Discussion

### Identity ownership

The initial declaration must make repository identity explicit. `title`, `description`, and `repo_code` are useful to repository inventory and workspace reporting, but they must be supplied or deliberately selected by the initializer rather than guessed from a directory name or Git remote.

### Safety and recovery

Initialization cannot use the normal repository selector because that selector correctly requires an existing declaration. It needs a dedicated physical Git-root preflight and a recoverable two-part transition: declaration creation and local registration. Re-running the command must state that the repository is already initialized rather than overwrite authored configuration.

### Relationship to registration

`ki repo register` remains the operation for persisting an existing KI repository in local configuration. `ki repo init` composes declaration creation with that registration as part of the same local lifecycle; it does not replace registration as a separate capability. `ki repair` and `ki repo conform` use the same registration boundary, so inventory does not depend on current conformance.
