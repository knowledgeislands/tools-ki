---
id: KI-TOOL-KI-CLI-142
area: CLI
title: Preserve harness release settings
project: tools-burndown
component: bootstrap
kind: deliver
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 2777b4d6eabe12fb4c55bbcc427fb990ecece04c
created_at: 2026-10-16T19:29:34Z
updated_at: 2026-10-18T07:12:00Z
---

# Preserve harness release settings

## Goal

KI retains configured harness release locations, verification digests and authentication settings when another configuration operation rewrites the user configuration. Changing bootstrap, skills or a local development selection must not silently remove the information needed to install a selected harness.

## Context

The current source proves a mismatch between reader and writer ownership. [The harness registry reader](../../src/core/storage/registry.ts) accepts `harnesses.releases` entries with `id`, `url`, `sha256` and optional `auth`. In [the user configuration writer](../../src/agents/configuration.ts), `preservedTables` excludes the entire `harnesses` table because it is in `OWNED_KEYS`, while `renderConfiguration` emits only `harnesses.ids`. The writer has no release-entry input, so rewriting a configuration drops its configured release entries rather than round-tripping them.

This writer is called by [bootstrap and user-configuration refresh](../../src/agents/bootstrap.ts), and by local-source and configured-skill setters in the same configuration module. A reviewed chezmoi source retaining a release pin can consequently drift from the live configuration after an otherwise unrelated KI operation. Preserve the configured values instead of treating the missing live block as a reason to discard its source declaration.

## Boundary

Adopted for delivery by the tools-burndown run on 18 October 2026 under Kris Brown's overnight instruction to burn down the tools roadmap; the adoption is provisional, for Kris to confirm. No release, provider call or live configuration rewrite is authorised. Do not change release selection, digest validation, authentication policy or the built-in canonical harness contract. Authentication settings mean strategy/configuration metadata, never credentials to copy into repository records or tests. Moving host-specific local harness paths has a separate outcome and must not be bundled into this repair.

## Current state

The single user-configuration writer, `writeUserConfiguration` in [configuration.ts](../../src/agents/configuration.ts), now reads the current file once, keeps its delegated tables and carries its `harnesses.releases` entries through `renderConfiguration`. Bootstrap, refresh, local-development and skill-selection commands all rewrite through it, so each keeps the releases. The configuration inspector also recognises the `auth` key, which it previously reported as unrecognised although the registry reader accepts it.

## Steps

- [x] Read the current configuration once in `writeUserConfiguration` and derive both the preserved delegated tables and the release entries from it.
- [x] Render release entries after `harnesses.ids` as `[[harnesses.releases]]` tables; when any entry is not a table, render the list inline unchanged so validation still reports it.
- [x] Add `auth` to the keys the inspector recognises in a release entry.
- [x] Cover the round trip and the malformed list through the public CLI, and note the change in the changelog.

## Files touched

- [src/agents/configuration.ts](../../src/agents/configuration.ts)
- [src/tests/cli/dev/dev.test.ts](../../src/tests/cli/dev/dev.test.ts)
- [CHANGELOG.md](../../CHANGELOG.md)

## Verify

- `keeps configured harness releases when it rewrites the file`: two synthetic releases, one with `auth = "github-cli"`, survive `ki dev local set`, `ki dev local on` and `ki bootstrap --refresh` with identity, URL, digest and authentication setting intact, the local binding takes effect, and `ki diag` reports no unrecognised key.
- `keeps a malformed release list for validation to report`: `releases = ["not-a-table"]` survives a rewrite unchanged.
- The full coverage suite passes at the 100% thresholds; `tsc`, Biome and the repository audit pass.

## Dependencies / blocks

None. Moving host-specific local harness paths remains [KI-TOOL-KI-CLI-143](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-143-separate-local-harness-paths.md).

## Documentation impact

### Decision Records

None.

### Specifications

None: the harness release keys are described by the registry reader and the changelog.

### Guides

None; the changelog's harness bullets gain the round-trip sentence.

### Roadmap

Adopted and delivered in one sitting under the overnight instruction; no acceptance or release.

## Review

### Delivered

Release entries and their `auth` setting now survive every user-configuration rewrite, and diagnostics accept `auth`.

### Change Summary

`writeUserConfiguration` reads the file once and passes its release entries to `renderConfiguration`, which emits them after the harness ids; the inspector's release keys gain `auth`.

### Verification

Two new public-CLI tests in `dev.test.ts`; the full coverage suite, `tsc`, Biome and `ki repo audit` pass.

### Outstanding concerns

- Terra and Sol live verification is withheld: it needs a managed configuration rewrite under its normal approval and an installed build carrying this change.
- Provisional choices, for Kris to confirm: release entries are carried as data, not re-validated, by the writer; a malformed list is kept inline so validation still fails rather than being dropped; the `auth` inspector fix is bundled because the round-trip test exposed it.

### Post-change review

The change is confined to the one writer and one inspector list; release selection, digest validation and authentication policy are untouched.

### Mini recap

Configured harness releases no longer vanish when KI rewrites the user configuration.

## Discussion

### Round-trip ownership

Decide how the writer carries complete supported harness release entries alongside harness identities. Retain meaning across rewrites, including all selected releases and each supported authentication shape, rather than preserving only the release seen in one machine's configuration. Preserve unrelated delegated tables and current validation failures; accepting unknown or malformed release data is not an incidental requirement of this fix.

### Evidence and verification expectations

The future repair needs public CLI contract coverage through `run(args, context)` for the supported rewrite paths, using synthetic releases and injected capabilities without network access or secrets. Verify that parsed release identity, URL, digest and authentication settings survive, while the requested bootstrap, skill or local-setting change still takes effect.

After an approved implementation, verify Terra and Sol separately against their own reviewed source and live configurations, recording the installed CLI version and the operations actually exercised. Any managed configuration apply or rewrite needs its normal approval boundary. Current code evidence establishes the defect; Sol has not been inspected for this concern, and a result on Terra must not be reported as proof for Sol.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against its Goal, Steps and three Verify items. No code was changed, no configuration was rewritten and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Steps:** `preservedReleases` and `releaseLines` in `src/agents/configuration.ts` carry `harnesses.releases` through the one writer as data, as `[[harnesses.releases]]` tables, or inline when an entry is not a table; the inspector accepts `auth`.
- **Verify 1 and 2:** the tests at `src/tests/cli/dev/dev.test.ts:150` and `:179` run `ki dev local set`, `ki dev local on` and `ki bootstrap --refresh` through the public CLI, and assert both synthetic releases, the `auth` value, the local binding taking effect, no unrecognised key from `ki diag`, and the malformed list kept.
- **Verify 3:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc and biome were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1, neither from this record.
- **Still open for Kris:** the Discussion asks for live checks on Terra and Sol, each against its own configuration. The delivery withheld them and this review did not run them, because they need a managed configuration rewrite. The three provisional choices under Outstanding concerns also need his confirmation.
