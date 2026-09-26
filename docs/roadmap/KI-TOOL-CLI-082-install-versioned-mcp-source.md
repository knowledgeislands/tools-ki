---
id: KI-TOOL-CLI-082
area: CLI
title: Install versioned MCP source
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: a540798331a18c6a888895db4c792c8e25e1097f
transferred_from: ki-agentic-harness
created_at: 2026-09-24T07:59:48Z
updated_at: 2026-09-26T12:43:20Z
---

# KI-TOOL-CLI-082: Install versioned MCP source

## Goal

Install a Knowledge Islands MCP server by GitHub `owner/repository` and an optional deliberate version, with inspectable provenance, atomic activation, rollback, update, and uninstall.

## Context

The Harness source-distribution contract defines an installable release as an annotated `v<SemVer>` tag resolving to a full commit object ID, with the matching package version, governed build, committed Bun lockfile, and MCP entry point. It deliberately does not require npm publication, official MCP Registry metadata, or a duplicative repository descriptor.

This receiver item owns the product behaviour proposed as `ki manage mcp install`. It must resolve explicit versions exactly and may resolve an omitted version only through the repository owner's latest stable GitHub Release marker. Public and private repositories use the same contract; private access relies on the operator's existing Git credentials.

## Boundary

Do not publish server packages, create tags or releases, change repository visibility, establish Git credentials, edit live MCP bindings, or advertise the command on the website before it exists. The Harness owns repository readiness, `ki-binding` owns client configuration, and server owners retain release authority.

## Current state

The 2026-09-24 autonomous roadmap batch excluded this item because private latest-Release lookup had no settled secret-safe authentication boundary. An explicit-version-only implementation would not have delivered the stated goal.

The authentication question is now resolved for delivery: unauthenticated GitHub Release lookup and Git clone serve public repositories; explicit `--auth github-cli` uses `gh api` and `gh repo clone` for private repositories. Never read or persist a token.

The installation root is `$KI_DATA_HOME/mcp/<owner>/<repository>/`. Complete builds live below `versions/<tag>-<commit>/`, each with `receipt.json`; `active` is an atomically replaced relative symbolic link. Complete versions remain available for rollback until explicit uninstall, with no automatic garbage collection.

## Steps

- [x] Add `ki manage mcp install <owner/repository> [version] [--auth github-cli]`, `update <owner/repository> [version] [--auth github-cli]`, `rollback <owner/repository> <version>`, `uninstall <owner/repository>`, and `list [owner/repository] [--format text|json]`.
- [x] Resolve an explicit SemVer only as its exact `v<SemVer>` annotated tag. Resolve an omitted version only from the latest stable GitHub Release marker, using the public API by default or `gh api` under explicit `--auth github-cli`, without exposing credentials.
- [x] Clone the selected tag into same-filesystem staging, verify canonical GitHub origin, annotated tag and peeled full commit, `[skills.ki-repo-mcp]`, matching package version, governed entry point, build script, and committed Bun lockfile.
- [x] Run `bun install --frozen-lockfile` and the governed build, verify `dist/mcp-server/index.js`, write a schema-one provenance receipt, promote the complete version, and atomically activate it only after every check succeeds.
- [x] Make update require an existing installation, rollback select a complete retained receipt without network or build, uninstall validate and remove the whole exact repository installation, and list expose active and retained versions without binding clients.
- [x] Cover public and private latest resolution, exact versions, validation failures, failed build rollback, idempotence, activation, rollback, uninstall, receipts, list output, grammar, completion, and inventory through the CLI seam.
- [x] Align specification, user guide, README, manual, command inventory, completion, and changelog.

## Files touched

- `src/commands/manage/`, `src/core/mcp/`, and their public indexes
- `src/tests/cli/manage/mcp.test.ts` plus completion and inventory contracts
- `docs/specs/management.md`, `docs/guides/user/local-installation.md`, `README.md`, `man/ki.1`, `man/ki.commands.json`, and `CHANGELOG.md`

## Verify

- Focused MCP lifecycle, completion, and inventory tests pass.
- `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run test:coverage`, manual lint, generated command inventory check, and applicable repository audits pass.

## Dependencies / blocks

No local work-item dependency blocks execution. Public latest lookup requires GitHub availability; private access requires `--auth github-cli` and an authenticated `gh` session; source checkout and build require `git` or `gh`, plus `bun`. Missing external tools or authentication fail before activation and preserve the prior active version.

## Delegation

Delegate bounded reconnaissance of existing acquisition and authentication seams. Keep lifecycle design, integration, filesystem mutation, verification, and final review with the primary agent because the implementation is one tightly coupled atomic-install boundary.

## Documentation impact

### Decision Records

No new decision record. The installation model follows `GDR-KI-HARNESS-011`; the private latest fallback implements the repository's existing GitHub CLI authentication boundary.

### Specifications

Add observable install, update, rollback, uninstall, list, provenance, and failure-atomicity requirements to the management specification.

### Guides

Document source installation lifecycle, paths, authentication preconditions, retained rollback versions, and the separation from client binding.

### Roadmap

Record delivery evidence and the exact authentication resolution in this item.

## Review

### Delivered

Implemented the complete versioned MCP source lifecycle under `ki manage mcp`, including public and authenticated private acquisition, exact-release verification, locked builds, immutable provenance, atomic activation, retained rollback, inventory, and uninstall.

### Change Summary

Added the command and core MCP boundaries, exhaustive CLI contract coverage, generated command inventory entries, and aligned specification, guide, README, manual, completion, and changelog surfaces.

### Verification

Focused MCP, completion, and inventory tests pass. TypeScript, Biome, Knip, manual lint, generated inventory, applicable repository audits, and the full 883-test coverage suite pass with 100% statements, branches, functions, and lines.

### Outstanding concerns

None. Client binding remains deliberately outside this source-installation boundary.

### Post-change review

Delegated review identified private clone transport and failed-first-install cleanup gaps; both were corrected and covered. It also prompted stricter canonical SemVer validation. The apparent receipt active-state gap was resolved by clarifying the designed split between immutable per-version provenance and the atomic active-selection link.

### Mini recap

CLI-082 is implemented and verified from immutable baseline `a540798331a18c6a888895db4c792c8e25e1097f`.

## Done

Accepted on 2026-09-26 after human approval of the delivery review packet and successful re-verification against `e45633e60d69cd0623f5ac5e5a532d254c624346`.

## Discussion

### Installation lifecycle

Resolve the selected tag and full commit before building. Stage outside a working checkout, install from the committed lockfile in frozen mode, run the governed build, verify the declared entry point, then atomically change the active version only after every step succeeds. A failed install or update must leave the prior active version usable.

### Provenance

Retain an immutable versioned machine-readable receipt containing repository identity, tag, full commit, package version, entry point, installation time, schema version, and acquisition mode. The atomic relative `active` link records selection; the list projection combines it with receipts to expose active state. Updates and rollbacks select complete installations rather than mutate an active directory in place.

### Resolved product decisions

The shaped plan fixes the XDG data layout, command surface, stable-release lookup and private fallback, Git checkout strategy, schema-one receipt, retained-version policy, atomic recovery boundary, and path-free list projection. Client binding remains separately owned by `ki-binding`.
