---
id: KI-TOOL-KI-CLI-128
area: CLI
title: Granola retention safeguards
kind: deliver
purpose: corrective
project: knowledge-acquisition
component: acquire
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T14:26:48Z
updated_at: 2026-10-14T16:52:32Z
---

# KI-TOOL-KI-CLI-128: Granola retention safeguards

## Goal

Prevent Granola reset operations from destroying retained handling evidence or migration proof. Keep on-demand discovery able to distinguish existing packages, previously handled sources and genuinely unevidenced candidates without introducing another persistent index.

## Context

The owner authorised one tools-ki defect carrier and planning before coding on 14 October 2026 in the [Acquire approvals](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/decisions.md#decision-30-2026-10-14t141105z). This single carrier organises bounded tools-ki importer and associated Harness contract support; it is not implementation authority. The CLI number was reserved in a ledger-only commit before this record was written.

The [simplification report](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/simplify-granola-discovery.report.md) recommends on-demand identity/window/folder enumeration, an in-memory UUID-to-package map and the existing canonical ledger plus historical handled evidence. UUID and source-account binding are identity; title and territory are locators. Presence alone cannot prove completeness. Previously handled identities remain suppressed after their packages leave the inbox. No continuous importer, replacement ledger or second index is necessary for this model.

At inspected tools-ki revision `81cdf04ea132b49da0cbeea1d162e44d2858025d`, [resetGranola](../../src/core/acquire/granola/import.ts) recursively removes the state directory during rebuild, including nested migration proof. Adapter reset deletes the ledger and journal; source reset can delete a handled UUID from the ledger. Those are concrete evidence-loss defects even if state placement never changes. The present plan does not run any reset or treat every tracking file as disposable.

Deduplication read every canonical record and issuing ledger in tools-ki, Acquire, Harness and Knowledge Islands Principal on 14 October 2026. None carries these Granola defects. Existing agent lifecycle/status, repair and release records serve other outcomes. AI-session acquisition and the receiving lifecycle note remain their existing scopes. No Harness sibling, binary record or new feature record is allocated.

## Boundary

Documentation preparation only now: Next/Draft, null baseline and unchecked Steps. No Ready transition, coding, tests against real state, executable/projection change, Harness write, acquisition, migration, cleanup, acceptance, release or push. No provider, remote or credential operation.

A later separately approved corrective slice may cover reset retention, its public CLI fixtures and matching acquisition specification/guide. Independent `state_root`, new discovery command/API, amendment refresh, retries, durable receipt redesign and automated scheduling are conditional or deferred proposals, not bundled defect execution. The one carrier records those distinctions without approving them.

## Current state

The central receiver hard-codes `.acquire/granola/` when `capture_root` is set; the legacy receiver shares `+/_ACQUIRE/granola/` with its documents. Current importer enumeration leads to detail/transcript reads and state writes, including its dry-run route; it is not identity-only discovery. The Harness acquisition contract currently requires amendment revalidation. Neither supplies an approved identity-only operation today.

Acquire's current ledger/proof remain canonical. Two handled-without-capture identities depend on that surviving evidence; no verified destination/receipt may be fabricated for them. Journal state records interrupted writes, not a restartable discovery cursor. Existing captures, variants, routing, omissions, hashes, account bindings, memberships and proof must retain their bytes.

The installed `ki` executes the primary tools-ki source checkout. Documentation edits here do not change its behaviour. Before any future code work, the receiving owner must select an isolated delivery checkout and separately approve integration/activation; primary-checkout source edits would immediately affect the live executable.

## Steps

- [ ] Refuse all reset scopes when interrupted-write journal evidence is present, the ledger is malformed/unsafe, or the selected scope includes a disposition other than staged (including awaiting-review amendments). Preserve handled-but-absent evidence.
- [ ] Replace recursive rebuild removal with an exact prevalidated regular-file deletion list: ledger and verified staged meeting documents only. Preserve nested migration proof, unknown files, attachments, variants and directories. Component reset updates only its selected staged entry.
- [ ] Show the same exact deletion/update preview before confirmation, validate all affected documents before the first write and test through the public offline CLI seam for legacy and capture-root layouts.
- [ ] Update the existing specification and guide; run focused CLI tests, TypeScript, full 100% coverage and required repository gates. Commit explicit paths in this isolated worktree and return Awaiting review without activation or integration.

## Files touched

Only `src/core/acquire/granola/import.ts`, `src/tests/cli/acquire/granola.test.ts`, `docs/specs/acquisition.md`, `docs/guides/user/granola-acquisition.md` and this record. No Harness change is required for the conservative refusal/exact-file deletion slice. Its optional discovery/state-root contract work stays deferred.

## Verify

`ki repo audit --skill ki-work --repo .` and `ki repo audit --skill ki-work-roadmap --repo .`; public `run(args, context)` sandbox fixtures in `src/tests/cli/acquire/granola.test.ts` and `adapters.test.ts`; `bunx tsc --noEmit -p tsconfig.json`; `bun run test:coverage` with 100% thresholds; scoped Biome, rumdl and `git diff --check`. Assert source/handled ledger, proof, assets and unrelated files retain bytes; previews and refusals call no provider. No real reset is run.

## Dependencies / blocks

No same-repository build-order dependency; arrays are empty. Receiving review is an approval gate, not a fabricated build blocker. The [acquisition contract](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/acquire/ki-acquire-granola/references/standards-granola-acquisition.md) needs separately authorised matching retention wording. The [tools-ki acquisition specification](../specs/acquisition.md) remains the command contract owner.

Discovery is useful without relocation: match a complete requested-window UUID listing against existing package/account metadata and surviving handled evidence. Incomplete coverage or conflicting/duplicate packages produce unknown/incomplete results, never candidates. Keep all memberships; unmatched/unfoldered identities are flags without content reads. Acquired completeness is bounded to the verified projection and declared omissions; original attachments need their own evidence. Do not claim newly created provider meetings or detect amendments from UUID alone.

## Documentation impact

### Decision Records

No new architecture or receipt policy is accepted. The [acquisition command-boundary decision](../decisions/ADR-KI-TOOL-KI-004-acquisition-command-boundary.md) remains applicable; the importer stays in tools-ki. Future owners decide whether selected discovery/state-root changes need durable rationale.

### Specifications

The later corrective slice must specify exact reset/refusal and preservation semantics in the existing acquisition specification. A new identity-only discovery interface or state-root property needs its own explicit scope review.

### Guides

The later guide update must teach previews, refusals and recovery without treating retained evidence or journals as disposable. Acquire's current paths and settled-but-inactive future placement remain unchanged.

### Roadmap

One owner-requested defect carrier only. No binary carrier, Harness sibling, Ready transition, acceptance or speculative feature allocation. Acquire retains its independent migration and binary Drafts; receiving priorities and operational approval remain with their owners.

## Delegation

No subagents. The owner instruction on 14 October 2026 to progress both roadmap items, followed by the explicit bounded-local-engineering task, grants necessary readiness and delivery of this narrowed defect slice. It supersedes the prior preparation-only boundary for these exact paths. Use runtime-owned worktree `/Users/krisbrown/.local/state/ki/worktrees/tools-ki/granola-retention-20261014` on `fix/granola-retention-20261014`, because primary tools-ki source drives live ki. No primary-checkout integration, projection, migration, real reset, provider operation, source cleanup, release, push or self-acceptance. Stop for broader file/schema/runtime authority, failed gates or ambiguous evidence. Preserve on-demand UUID/package discovery and the canonical handled ledger; no new index or importer machinery.

## Discussion

### Necessary fixes and conditional support

Fixing destructive reset/refusal behaviour is necessary to keep current evidence safe; independent state placement is not a prerequisite for deterministic discovery. A smaller first slice may conservatively refuse unsafe reset cases instead of creating a general receipt framework. Choosing one requires receiving review, not an implicit implementation decision here.

If a later discovery capability is selected, prefer a restartable read-only UUID classifier with an in-memory map and current canonical evidence. Test title changes, handled-but-absent packages, damaged/partial/duplicate packages, account conflicts, multiple memberships and incomplete enumeration offline. Do not add a persistent index, journal for read-only listing, or continuous import by default. Any provider listing needs a separately named window and access grant.

If relocation is still wanted, bounded importer configuration support would admit repository-relative `state_root = "+/_ACQUIRE"`, preserve both absent-property defaults and fail closed on unsafe roots, conflicting ledgers and journals. Its associated Harness property/catalogue admission is conditional too. Exact Harness files are under `skills/acquire/ki-acquire-granola/`, including `SKILL.md`, the acquisition standard, `scripts/rubric/contexts/granola.ts`, `scripts/rubric/items/acquisition.ts`, `publication.ts` and affected tests/generated rubric only after review. Do not copy the earlier mistaken root-level rubric paths. No such support or migration is authorised by this Draft.

### Review stops

Stop for broader file scope, changed schemas/identities, missing handled proof, a request to discard journals, real resets or provider calls, or a need for install/release authority. Source completeness criteria and future durable receipt ownership remain receiving-owned decisions. The missing `.acquire/chatgpt/` migration mapping remains a later Acquire inventory stop; it is not silently swept into this Granola defect.
