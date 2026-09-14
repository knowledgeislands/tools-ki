---
id: KI-TOOL-BATCH-004
repository: https://github.com/knowledgeislands/tools-ki
approved: true
approved_at: 2026-09-14T01:47:03Z
authority_mode: outcome
authority_evidence: User authorised specification metadata repair, full CLI-066 support, explicit acceptance of CLI-062 and CLI-064, and autonomous delivery of every current roadmap item to done or awaiting review.
approved_payload_sha256: 4fd4bcb9f3bb277f180c4a3f3d157be849eec927283e05922f7caf4f1004af06
run_id: KI-TOOL-BATCH-004-RUN-001
timebox_ends_at: 2026-09-14T13:47:03Z
item_ids: [KI-TOOL-CLI-062, KI-TOOL-CLI-064, KI-TOOL-CLI-065, KI-TOOL-CLI-066]
completion_target: awaiting-review
mandatory_stops: [public-contract-change-outside-plan, material-scope-expansion, destructive-or-irreversible-work, external-coordination, verification-failure, push-or-release]
closure_item_ids: [KI-TOOL-CLI-062, KI-TOOL-CLI-064]
---

# KI-TOOL-BATCH-004 — Prepare the complete roadmap for review

## Outcome authority

The user explicitly signed off CLI-062 and CLI-064, accepting that any Granola inbound trial modifications belong to later remedial work. The user then delegated delivery of the complete current tools-ki roadmap to done or awaiting review. This generated contract records that authority without a second approval gate.

## Selected plans

1. [CLI-062](../../docs/roadmap/KI-TOOL-CLI-062-support-standing-knowledge-intake.md) — record approved acceptance and retain the done record.
2. [CLI-064](../../docs/roadmap/KI-TOOL-CLI-064-import-granola-meetings.md) — record approved acceptance with the live-trial caveat and retain the done record.
3. [CLI-065](../../docs/roadmap/KI-TOOL-CLI-065-review-estate-audit.md) — identify the current estate-audit failure and repair specification conformance metadata against implementation evidence.
4. [CLI-066](../../docs/roadmap/KI-TOOL-CLI-066-report-roadmap-statistics.md) — deliver timestamp parsing, guarded monotonic mutations, and text/JSON roadmap statistics under the delivered Harness contract.

## Scope and decisions

Only tools-ki files are writable: the named records, this authority, the specification corpus, roadmap core and command modules, the shared filesystem publication boundary if required for observed-revision protection, CLI contract tests, and public README/changelog/manual/completion surfaces. Other repositories remain read-only. Preserve timestamp-free records during the compatibility period; no historical backfill or remote-adapter implementation is included. Use one implementation lane because the codec, statistics and CLI contracts are coupled. No delegation is planned.

CLI-065 covers the known baseline CONFORMANCE-1 failures rather than treating the repair's own target as an unexplained preflight stop. Any additional failure is diagnosed and repaired only within the selected records' scope. Its independently verified commit precedes CLI-066 implementation.

## Verification

Validate existing specification evidence against the CLI contract suite, run the specification and roadmap audits, and verify the final implementation with targeted roadmap/completion tests, the full 100% coverage gate, TypeScript, Biome, Knip, man-page lint, and the complete repository audit. A passing gate is implementation evidence, not a claim that a live Granola account was exercised.

## Completion and boundaries

CLI-062 and CLI-064 close through ki-accept under exact human sign-off. CLI-065 and CLI-066 reach awaiting-review with their own baseline and six-heading review packets. Retain all records; no pruning, push, release, live acquisition, user-environment repair, or peer-repository write is authorised. No candidates are excluded from the four-record snapshot.

## Run ledger

<!-- ki-batch-run: KI-TOOL-BATCH-004-RUN-001 4fd4bcb9f3bb277f180c4a3f3d157be849eec927283e05922f7caf4f1004af06 -->

### CLI-062 and CLI-064 acceptance

Both records were awaiting-review at `dd949e2eb01b440cd2b8590aa36c2d85196237df` with complete review packets and immutable delivery references. The user explicitly approved both, including CLI-064's unperformed live Granola trial and its later remedial treatment. Both now record done; no records were pruned and no live import is claimed.

### CLI-065 estate audit

The repository-wide specification audit failure was traced to missing explicit conformance metadata on 97 existing requirements. The specification estate was repaired without changing requirement meaning, the full repository audit passed, and CLI-065 reached `awaiting-review` in commit `576fec55424bf588ae3b80a63348c30e1c4e620c`.

### CLI-066 roadmap compatibility and statistics

The common local work-item codec now accepts the published timestamp pair, advances `updated_at` on timestamped CLI horizon mutations, and keeps timestamp-free compatibility records readable. `ki repo roadmap stats` supplies deterministic text and versioned JSON metrics. Final source validation also found the published unadopted `triage` horizon; list and statistics now include it while generic promote and demote refuse to adopt it.

### Batch recap

CLI-062 and CLI-064 are retained as `done`. CLI-065 and CLI-066 are retained as `awaiting-review`. No roadmap record was pruned, no peer repository was written, and nothing was pushed or released.
