---
id: KI-TOOL-CLI-075
area: CLI
title: Align website tool routes
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T21:05:16Z
updated_at: 2026-09-18T03:04:16Z
---

# KI-TOOL-CLI-075: Align website tool routes

## Goal

Make `ki manage docs overview` print a live website address again, and adopt the registry handoff that keeps the website's advertised `ki` version matching what this repository has released.

## Context

`knowledgeislands/ki-website` delivered `KI-WEB-SITE-007`, which gives every released Knowledge Islands tool the same two public routes: `/tooling/<tool>/` for people and `/install/<tool>` for machines. Both are generated from one website-owned registry.

That retired two routes this repository depends on. `/tooling/cli/` is now `/tooling/ki/`, and `/harness/install` is now `/install/ki`. No compatibility alias was kept, which was the website item's explicit instruction.

`ki manage docs overview` still prints `https://knowledgeislands.info/tooling/cli/` as of `v0.3.6`. That address is dead, so the command now hands a user a 404.

The website's `/install/ki` endpoint redirects to this repository's `install.sh` at an immutable release tag, currently `v0.3.6`. Advancing that declaration is a release follow-up owned here, not something the website discovers.

## Boundary

This does not move release authority, installer behaviour, artifact hosting, or checksum verification to the website. The website is an indirection layer over what this repository publishes.

This item does not redesign the `ki manage docs` command surface; it corrects one printed string and adds a release step.

## Current state

`src/commands/manage/docs.ts`, its CLI contract test, and `man/ki.1` still name the retired `/tooling/cli/` route. The other printed locations remain repository-owned or site-root routes and require no change. The release guide mentions updating the KI Website after a release but does not define the version-pinned handoff evidence.

## Steps

- [ ] Change the canonical overview location to `https://knowledgeislands.info/tooling/ki/` and update the CLI contract assertions.
- [ ] Update the manual's `ki manage docs overview` route while preserving the other documentation topics.
- [ ] Extend the release guide with the exact post-publication website handoff: released version, immutable raw `install.sh` target, and pinned invocation.
- [ ] Verify no retired `/tooling/cli/` or `/harness/install` route remains in shipped source, tests, manual, README, or guides.
- [ ] Run focused documentation-command and manual checks followed by the complete repository gates.

## Files touched

Expected scope is `src/commands/manage/docs.ts`, `src/tests/cli/manage/local-commands.test.ts`, `man/ki.1`, `docs/guides/developer/release-management.md`, and this work record.

## Verify

Run `bunx vitest run src/tests/cli/manage/local-commands.test.ts`, `bun run ki:tools:lint-man`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run build`, `ki repo audit --repo .`, `rg 'tooling/cli|harness/install' src docs README.md man`, and `git diff --check`. The route search must return no shipped references outside historical review evidence.

## Dependencies / blocks

None. CLI-076 decides the shared pinned-installer spelling, but this item can correct the dead overview route independently. Sequence CLI-076 first in the batch so the release-guide handoff can use its settled wording.

## Documentation impact

### Decision Records

No new decision record is needed; website route ownership and installer indirection were already decided by the website owner.

### Specifications

No behaviour-level specification change is needed because this is a correction to a published documentation location rather than a new command contract.

### Guides

Update the developer release guide with the exact website registry handoff after immutable publication.

### Roadmap

CLI-076 remains the owner of the shared version-pinning interface. No additional local work item is expected.

## Discussion

### The printed address

`ki manage docs overview` should print `https://knowledgeislands.info/tooling/ki/`. Check whether `ki manage docs site`, `manual`, and `roadmap` carry any other website-derived address that moved.

### The release handoff

After publishing a release intended for general recommendation, hand `ki-website` an item naming the exact version and the immutable installer target `https://raw.githubusercontent.com/knowledgeislands/tools-ki/<version>/install.sh`. The website updates its registry entry and ships; nothing advances on its side until that handoff arrives, which is deliberate.

The website verifies declared routes before deployment and reports upstream drift as a warning, so a release that has not yet been handed over is visible rather than silently followed.

### Related

Originating repository and item: `knowledgeislands/ki-website` `KI-WEB-SITE-007`. That item is done; this one does not block it. The route contract is documented at `docs/guides/tool-routes.md` in that repository.

`KI-TOOL-CLI-076` covers the separate installer version-pinning interface question.
