---
id: KI-TOOL-KI-CLI-128
area: CLI
title: Granola retention safeguards
kind: deliver
purpose: corrective
project: knowledge-acquisition
component: acquire
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T14:26:48Z
updated_at: 2026-10-14T22:58:36Z
---

# KI-TOOL-KI-CLI-128: Granola retention safeguards

## Goal

Prevent Granola reset operations from destroying retained handling evidence or migration proof. Keep on-demand discovery able to distinguish existing packages, previously handled sources and genuinely unevidenced candidates without introducing another persistent index.

## Context

On 14 October 2026, the owner confirmed RESET-FIRST: safe reset is this record’s first piece of work; independent `state_root` remains conditional. The refusal step explicitly covers both `--rebuild` and ordinary adapter reset before any Ready request. This documentation clarification preserves this copy’s existing lifecycle and implementation evidence; it grants no Ready transition, new coding, integration, acceptance, migration or actual reset. Receiving evidence: [owner-answer relay](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_THREADS/knowledge-acquisition/handoff-review.report.md); owner decision: [Acquire decisions](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/decisions.md#decision-38-2026-10-14t225614z).

The owner authorised one tools-ki defect carrier and planning before coding on 14 October 2026 in the [Acquire approvals](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/decisions.md#decision-30-2026-10-14t141105z). This single Draft organises bounded tools-ki importer and associated Harness contract support; it is not implementation authority. The CLI number was reserved in a ledger-only commit before this record was written.

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

- [ ] Have the existing receiving coordinator review this narrowed corrective plan against the discovery-first proposal. Freeze reset semantics, deletion preview and exact paths before requesting separate Ready and implementation authority.
- [ ] Under that later grant, replace recursive state-directory deletion with an exact preview of only verified, owned disposable files. Preserve nested proof, unknown files, attachments and variants; do not silently broaden ownership to a directory.
- [ ] Refuse both ordinary adapter reset (without `--rebuild`) and adapter reset with `--rebuild` whenever deleting the ledger would lose any handled disposition. Refuse source reset for a handled UUID; refuse component reset if it would invalidate its retained evidence. Preserve unsupported/corrupt evidence and interrupted-write journals, and return a clear refusal rather than resetting to make state appear clean.
- [ ] Prove reset refusal and safe disposable-only behaviour through injected public CLI sandbox fixtures, including central and legacy layouts, handled-but-absent packages, nested proof, symlinks, corrupt journals and unknown files. No real provider or source state is used.
- [ ] Have the Harness owner separately approve its bounded contract wording and any necessary existing catalogue tests. Describe identity-only discovery as a distinct, separately authorised read operation; do not weaken faithful acquisition or amendment checks globally. Return compatible local revisions and fixture results, without changing projection/install state.
- [ ] Return the corrective delivery for human review. Reconsider optional discovery/state-root support only after its necessity is demonstrated; refresh Acquire's exact migration plan separately and stop before migration, source retirement or cleanup.

## Files touched

Current preparation: only `docs/roadmap/_ISSUES.md` in its completed reservation commit and this record in a separate documentation commit.

Prospective minimum corrective implementation, not authorised now: `src/core/acquire/granola/import.ts`, `src/tests/cli/acquire/granola.test.ts`, `docs/specs/acquisition.md` and `docs/guides/user/granola-acquisition.md`. Inspect existing helpers before expanding this list. A path addition requires review, not an implicit glob grant. Changes to `layout.ts`, `routing.ts`, `images.ts`, adapter inventory or command plumbing are conditional on later state-root/discovery selection.

Harness support stays in its own repository and requires its own grant. Candidate contract file: `skills/acquire/ki-acquire-granola/references/standards-granola-acquisition.md`; tests/catalogue under the skill's actual `scripts/rubric/` root only where the selected contract requires them. No Harness record or file is written here.

## Verify

Preparation: `ki repo audit --skill ki-work --repo .`, `ki repo audit --skill ki-work-roadmap --repo .`, scoped `rumdl check` and `git diff --check`. Assert one reserved CLI identity, Next/Draft, null baseline, unchecked Steps and explicit-path commits with the actual model trailer. Check that source/configuration and all pre-existing records are unchanged.

Later corrective gate: invoke public `run(args, context)` and sandbox fixtures through `src/tests/cli/acquire/granola.test.ts`; run the local Vitest executable for that file, local TypeScript `--noEmit -p tsconfig.json`, `bun run test:coverage` at the repository's 100% thresholds, local Biome checks and scoped rumdl. Assert no provider calls; unchanged handled UUIDs/account/version/hash evidence; byte-identical nested proof, variants and unknown files; exact preview matching permitted effects; and no ledger/journal advance after refusal. A fixture pass cannot certify source completeness or installed support.

Future Harness gate is its owner's offline acquisition-contract/catalogue tests, TypeScript and skill audit, scoped to the separately approved files. No test is run against a live receiver, provider or installation as part of this plan.

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

This is a reviewable plan, not an active worker packet. The existing [knowledge-acquisition coordinator](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_CHECKPOINTS/knowledge-islands-model.knowledge-acquisition.md) owns receiving review; tools-ki owns the corrective host lane, Harness owns its contract lane, and Acquire owns any later local cutover. No delegated agent is launched.

Before future integration, record the known-good executable/configuration/projection revisions and prove disposable-fixture restoration preserves prior state/proof bytes. A runtime or connection-critical rollout needs separately authorised activation and a tested restore path that reconnects first. No service, auth, network, host or credential operation is in this plan.

## Discussion

### Necessary fixes and conditional support

Fixing destructive reset/refusal behaviour is necessary to keep current evidence safe; independent state placement is not a prerequisite for deterministic discovery. A smaller first slice may conservatively refuse unsafe reset cases instead of creating a general receipt framework. Choosing one requires receiving review, not an implicit implementation decision here.

If a later discovery capability is selected, prefer a restartable read-only UUID classifier with an in-memory map and current canonical evidence. Test title changes, handled-but-absent packages, damaged/partial/duplicate packages, account conflicts, multiple memberships and incomplete enumeration offline. Do not add a persistent index, journal for read-only listing, or continuous import by default. Any provider listing needs a separately named window and access grant.

If relocation is still wanted, bounded importer configuration support would admit repository-relative `state_root = "+/_ACQUIRE"`, preserve both absent-property defaults and fail closed on unsafe roots, conflicting ledgers and journals. Its associated Harness property/catalogue admission is conditional too. Exact Harness files are under `skills/acquire/ki-acquire-granola/`, including `SKILL.md`, the acquisition standard, `scripts/rubric/contexts/granola.ts`, `scripts/rubric/items/acquisition.ts`, `publication.ts` and affected tests/generated rubric only after review. Do not copy the earlier mistaken root-level rubric paths. No such support or migration is authorised by this Draft.

### Review stops

Stop for broader file scope, changed schemas/identities, missing handled proof, a request to discard journals, real resets or provider calls, or a need for install/release authority. Source completeness criteria and future durable receipt ownership remain receiving-owned decisions. The missing `.acquire/chatgpt/` migration mapping remains a later Acquire inventory stop; it is not silently swept into this Granola defect.
