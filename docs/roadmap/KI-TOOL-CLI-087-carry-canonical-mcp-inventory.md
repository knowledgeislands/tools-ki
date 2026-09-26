---
id: KI-TOOL-CLI-087
area: CLI
title: Carry canonical MCP inventory
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 12beb676c6c8f97ada1c9a9357afa03b1f9c78d6
created_at: 2026-09-26T15:18:29Z
updated_at: 2026-09-26T15:18:29Z
---

# KI-TOOL-CLI-087: Carry canonical MCP inventory

## Goal

A user whose canonical MCP server inventory lives outside `~/.config/ki/` can say so once, in `ki`'s own configuration, and have every KI capability that resolves that inventory find it — whether the capability runs inside `ki` or in a command `ki` starts.

## Context

Cross-surface MCP binding resolves one `mcpServers:` YAML inventory through `$KI_MCP_SOURCE`, defaulting to `$XDG_CONFIG_HOME/ki/mcp-servers.yaml`. On a host whose inventory is held elsewhere — a chezmoi data file, for example — the binding check reports the default path as absent and there is no durable place to record the real one. A login-shell fragment was the rejected alternative: it does not reliably reach every adapter that invokes `ki`, and an agent run's environment has the variable unset.

The gap is specific to how KI capabilities run. A skill rubric catalogue is dynamically imported into `ki`'s own process rather than spawned, so it reads `process.env`; a conform or audit subprocess reads the environment `ki` hands the runner. Recording the inventory in only one of those two places leaves the two disagreeing about which file is canonical.

The work was raised outside this repository, on Paperclip tasks KNO-18 and KNO-28, where the user chose the topology — point the variable at the existing chezmoi inventory — and the placement: `ki` configuration, exported by `ki`.

## Boundary

This item carries an already-authored inventory path into the environment. It does not:

- widen the portable binding schema to admit fields a particular inventory carries;
- validate the inventory's contents, or require the named file to exist at all;
- write any host's `config.toml`;
- report the resolved inventory in `ki manage diag` or `ki manage doctor`;
- change how installed MCP server sources under `ki manage mcp` are named or resolved.

## Current state

`config.toml` is read only on the paths that need it: `readHarnessRegistry` and `configuredHarnessIds` in `src/core/storage/registry.ts`. Neither knows about MCP, and no `ki` source file mentions `KI_MCP_SOURCE`. An unknown `[mcp]` table in `config.toml` is silently ignored today, so a host may carry the declaration before or after this lands.

`src/main.ts` hands `createContext` the real `process.env` rather than a copy, and `src/core/runtime/runner.ts` passes `context.environment` straight to `spawn`. One in-place assignment therefore reaches both the in-process consumer and every spawned child; a copy at either end would split them.

## Steps

- [x] Read an optional `[mcp]` table from `config.toml` tolerantly — a missing, irregular or unparseable file is left for the harness registry reader to report — and validate a present table strictly as exactly one non-empty absolute `inventory` path.
- [x] Adopt the resolved path as `KI_MCP_SOURCE` on the environment `ki` was handed, only when a non-empty value was not inherited, so the published resolver's explicit-variable-first order still holds.
- [x] Apply the adoption in `run` before command dispatch, so a malformed declaration reports through the ordinary `KiError` boundary rather than as an entrypoint crash.
- [x] Record in `src/main.ts` why the entrypoint passes `process.env` itself, so a later copy does not silently break in-process consumers.
- [x] Cover inherited precedence, an empty inherited value, configuration filling the gap, an absent table, an absent, irregular and unparseable configuration file, a tolerated missing inventory file, and each validation refusal through the CLI seam.
- [x] Publish the behaviour as `CLI-006` and `CLI-007` and document the declaration in the local-installation guide.

## Files touched

- `src/core/storage/mcp-inventory.ts` — new
- `src/cli.ts`, `src/main.ts`
- `src/tests/cli/root/mcp-inventory.test.ts` — new
- `docs/specs/cli.md`, `docs/guides/user/local-installation.md`

## Verify

- `bun run test:coverage` passes with the 100% statement, branch, function and line thresholds intact.
- `bunx tsc --noEmit`, `bunx biome check` and `bunx knip` pass.
- Against the real development host, `ki repo audit --skill ki-binding` resolves the configured inventory instead of the `~/.config/ki/mcp-servers.yaml` default, an inherited `KI_MCP_SOURCE` still wins, `ki manage doctor` reports the same `PASS=14 FAIL=0 SKIP=0` as without the declaration, and a non-absolute `inventory` refuses with exit status 1.

## Dependencies / blocks

No build order. The portable schema widening that makes the binding check pass on the chosen inventory is separate work in `ki-agentic-harness` (Paperclip task KNO-20) and is not a dependency of this change: this item is about which file is resolved, not what the file may contain.

## Documentation impact

### Decision Records

No new decision record. The precedence order is already fixed by the published cross-surface binding standard; this item implements a configuration fallback inside it rather than choosing a new contract.

### Specifications

Adds `CLI-006` and `CLI-007` to the CLI area: the adoption behaviour and precedence, and the refusal of an `mcp` declaration that does not resolve to exactly one absolute inventory path.

### Guides

Adds a local-installation section showing the declaration, its precedence, the deliberate tolerance of a missing file, and its separation from the MCP source installations that `ki manage mcp` builds.

### Roadmap

No follow-on roadmap change required by this item. Reporting the resolved inventory in `ki manage diag` and `ki manage doctor` is a deliberate exclusion above and is captured separately if it is wanted.

## Review

### Delivered

The approved boundary: read and validate an optional `[mcp] inventory` declaration in `config.toml`, adopt it as `KI_MCP_SOURCE` for `ki`'s own process and its spawned children, and leave an inherited value authoritative. Excluded, as approved: the portable schema widening, any host `config.toml` write, inventory content validation, requiring the file to exist, and diagnostic reporting of the resolved path.

Immutable baseline `12beb676c6c8f97ada1c9a9357afa03b1f9c78d6`.

Resulting evidence: on the real development host, with the declaration present and `KI_MCP_SOURCE` unset, the `ki-binding` audit moved from resolving `/Users/krisbrown/.config/ki/mcp-servers.yaml` and reporting it absent, to resolving the declared `/Users/krisbrown/.local/share/chezmoi/.chezmoidata/mcp-servers.yaml` and reporting a schema concern in its contents. Because that check runs in `ki`'s own process rather than a subprocess, the change is direct evidence that the in-process direction works.

### Change Summary

- `src/core/storage/mcp-inventory.ts` — new: a tolerant `config.toml` read with a strict `[mcp]` validation, and the in-place adoption of `KI_MCP_SOURCE`.
- `src/cli.ts` — adopts the declaration at the top of `run`'s error boundary, before command dispatch.
- `src/main.ts` — records why the entrypoint hands over `process.env` itself.
- `src/tests/cli/root/mcp-inventory.test.ts` — new: four CLI-seam contract tests.
- `docs/specs/cli.md` — `CLI-006` and `CLI-007`.
- `docs/guides/user/local-installation.md` — the declaration and its precedence.

Material decisions: the key is `inventory`, not `source`, because `ki` already uses "MCP source" for an installed MCP server repository under `ki manage mcp`, and `inventory` is the noun the published binding standard uses for the file. The `[mcp]` table is a closed allow-list, so a mistyped key refuses loudly rather than resolving by accident. The environment is mutated in place rather than copied, because the entrypoint's `process.env` and `context.environment` are the same object in production and one assignment must reach both.

### Verification

- `bun run test:coverage` — 53 files, 892 tests passed; statements 9574/9574, branches 5803/5803, functions 2205/2205, lines 8172/8172, all 100%.
- `bunx tsc --noEmit` — clean.
- `bunx biome check` — 284 files checked, no errors.
- `bunx knip` — clean apart from three pre-existing configuration hints.
- Real-host checks, against a scratch `KI_CONFIG_HOME` copy of the host configuration carrying the declaration: the `ki-binding` audit resolved the declared inventory; the same audit with `KI_MCP_SOURCE` inherited resolved the inherited path instead; `ki manage doctor` reported `PASS=14 FAIL=0 SKIP=0`; a non-absolute `inventory` refused with `ki: error: ki configuration mcp inventory must be an absolute path` and exit status 1.

### Outstanding concerns

The `process.env` half of the contract is guaranteed structurally — the entrypoint hands over `process.env` itself — rather than by a test, because this repository's tests are black-box CLI-seam tests whose sandbox environment is deliberately isolated from the real process. It is held by a comment at each end and by the real-host audit evidence above. Making it a checked invariant would need either a sandbox that can opt into the real environment or an injectable process-environment port, and neither is in this item's boundary.

No other unresolved, unchecked or failing issue.

### Post-change review

Goal met: a host with an inventory outside `~/.config/ki/` can declare it once and have both in-process and spawned consumers agree. Scope held to the boundary; nothing in the binding schema, the host configuration, or the diagnostics surface changed.

Regression risk is low and concentrated in one place: every command now reads `config.toml` once at startup where previously only harness paths did. The read is deliberately tolerant of every fault except an `[mcp]` table it cannot resolve, so a half-configured or broken configuration keeps unrelated commands working exactly as before — covered by the absent, irregular and unparseable cases in the contract tests and by the unchanged `ki manage doctor` summary on the real host. Reversal is a plain revert of the listed files; a host declaration left behind is inert, because the previous `ki` ignores an unknown table.

Acceptance-ready.

### Mini recap

CLI-087 reads an optional `[mcp] inventory` declaration from `config.toml`, validates it as one absolute path, and adopts it as `KI_MCP_SOURCE` for `ki`'s own process and its spawned children without displacing an inherited value. Verified from immutable baseline `12beb676c6c8f97ada1c9a9357afa03b1f9c78d6` by the full coverage gate, the type, lint and dependency gates, and real-host audit evidence. One concern remains recorded: the in-process half is a structural rather than a tested invariant.

Learning routes, proposed not promoted: whether `ki manage diag` should report the resolved inventory alongside the other resolved paths; and whether the CLI test sandbox should be able to opt into the real process environment so entrypoint-level invariants become checkable.

## Discussion

### Key naming

`[mcp] source` was the name proposed when the work was raised, and it maps one-to-one onto `KI_MCP_SOURCE`, which is genuinely easier to remember across repositories. It was rejected because "MCP source" already means something else here: `ki manage mcp install owner/repository` installs and activates an MCP _server source_, with `McpSourceReceipt` provenance under `$KI_DATA_HOME/mcp/`, and the local-installation guide has a section by that name. A `config.toml` key called `source` under `[mcp]` would read, to a `tools-ki` maintainer, as configuration for those installations.

`inventory` is the noun the published binding standard already uses for the file, and it keeps `[mcp]` usable for the server-source concern later — `[mcp] inventory` and a future `[mcp.sources]` coexist, where `source` and `sources` would not.

### Precedence

The published standard fixes the resolver as explicit `$KI_MCP_SOURCE`, then absolute `$XDG_CONFIG_HOME/ki/mcp-servers.yaml`, then `<home>/.config/ki/mcp-servers.yaml`, and an eval asserts the explicit-variable-first claim. The declaration therefore sits strictly between the variable and the XDG default: it fills the gap an unset variable leaves and never displaces one that is set. An empty inherited value counts as unset, matching how the standard's own resolver treats it, so an exported-but-empty variable does not silently defeat the declaration.

### Why not require the file

Reporting an absent or invalid canonical inventory is precisely what the binding check exists to do. If configuration load failed on a missing file, every unrelated `ki` command on a half-configured host would stop working, and the one check whose job is to tell the user what is wrong would never get to run. A non-absolute or otherwise unresolvable _declaration_ is different: that is a configuration error the user can only have made deliberately, and it refuses at once.
