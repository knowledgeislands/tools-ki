# Qualify repository declarations for CLI-006

## Receiving repository

`knowledgeislands/ki-agentic-harness`

## Origin

`knowledgeislands/tools-ki` CLI-006, Persist qualified capability identities in repository declarations.

## Requested outcome

Adopt and plan the portable `.ki-config.toml` contract migration. A declared repository skill now uses a quoted qualified root such as `"knowledgeislands/ki-agentic-harness:ki-repo"`; nested settings use that quoted root, for example `"knowledgeislands/ki-agentic-harness:ki-tokenomics".budgets.

Update the configuration standard, examples, `ki-repo` catalogue/rubrics, and this repository's own declarations together. The configuration checker must recognise the qualified root as the skill's marker/configuration boundary rather than looking for a bare `[ki-*]` table.

## Constraints

- The new `ki` implementation rejects bare repository declarations without a compatibility fallback.
- This is a portable-contract and harness migration, not permission to change `tools-ki` implementation or release policy.
- Preserve each skill's own configuration object and nested tables; only the declaring root becomes qualified and quoted.
- Verify against the CLI-006 release candidate before its V1 release. The current released harness rubric will otherwise report qualified declarations as absent.

## Ownership and disposition

The receiving repository owns its roadmap placement, plan, implementation, tests, commit, and release readiness. This is non-blocking local work for the receiver, but its durable scheduling is a release-coordination gate for CLI-006. Reply with the adopted roadmap/plan locator, a decline, or a supersession so this outbound brief can be removed.
