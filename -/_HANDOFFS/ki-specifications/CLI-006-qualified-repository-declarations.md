# Migrate specifications declarations for CLI-006

## Receiving repository

`knowledgeislands/ki-specifications`

## Origin

`knowledgeislands/tools-ki` CLI-006, Persist qualified capability identities in repository declarations.

## Requested outcome

Adopt and schedule migration of this repository's `.ki-config.toml` declarations to quoted `<harness-id>:<skill-name>` roots. Preserve every existing configuration value and migrate nested tables under their qualified parent, including the tokenomics budget table.

## Constraints

- Use the provider identity confirmed by the compatible harness inventory; do not invent a provider or retain bare `[ki-*]` roots.
- Coordinate with the `ki-agentic-harness` contract handoff before relying on its updated rubrics.
- Verify the migrated repository against the CLI-006 release candidate; no CLI release happens merely because this brief exists.

## Ownership and disposition

The receiving repository owns its roadmap placement, plan, migration, verification, and commit. The migration is non-blocking local work, but its durable scheduling is required before CLI-006 can release. Reply with the adopted roadmap/plan locator, a decline, or a supersession so this outbound brief can be removed.
