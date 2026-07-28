---
id: 'CLI-001'
title: Publish atomic conform moves
status: in-progress
roadmap: cli/publish-atomic-conform-moves
blocks: —
blocked-by: —
baseline-ref: 7662ebf34aa9fa7d1be851da57a0027570a640dd
transferred-from: knowledgeislands/ki-agentic-harness:FND-001
---

# CLI-001: Publish atomic conform moves

## Context

Some clean conform cutovers must rename a canonical file, not merely replace or create one.
The repository-qualified plan-ID migration in the canonical harness is the first consumer.

## Current state

The rubric proposal contract and guarded publisher support replacement and exclusive creation only.
Representing a rename as copy-plus-retention would leave an invalid compatibility surface.

## Steps

1. Add a validated conform move to the public rubric proposal contract and runtime result.
2. Implement guarded native publication and dry-run validation for moves, including containment, source/destination identity, collision, and operation-conflict checks.
3. Wire moves through `ki repo conform`, preserving report, command, and re-audit behaviour.
4. Add CLI-contract coverage for successful, rejected, and dry-run moves; run the complete CLI verification suite.

## Files touched

- `src/core/rubric.ts`
- `src/core/runtime.ts`
- `src/core/transaction.ts`
- `src/commands/repo.ts`
- `src/tests/cli/transaction.test.ts`
- `src/tests/cli/repo.test.ts`

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- `bun run lint`

## Dependencies / blocks

Origin work: `knowledgeislands/ki-agentic-harness` FND-001.
