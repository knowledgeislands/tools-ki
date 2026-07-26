# CLI-004 compatible-harness operation constraints

**Origin:** `knowledgeislands/ki-agentic-harness` FND-004

**Recipient:** `knowledgeislands/tools-ki` CLI-004

**Status:** Incoming implementation brief. `tools-ki` owns adoption, priority, implementation, tests, and delivery.

## Requested outcome

Carry the compatible-harness constraints below into the tools-owned governed-rubric runtime and its CLI-004 fixtures.

They are extracted from the historical harness package-distribution proposal after its command, generic package-management, lock-file, adapter, and archive-model portions were superseded.

## Constraints to adopt

1. **Resolve before projecting.** Resolve declared capabilities from verified installed compatible harnesses, order explicit dependencies before execution, and refuse duplicate, missing, incompatible, or undeclared providers.
2. **Keep trust boundaries separate.** Acquisition and archive verification, installed-payload inspection, capability selection, repair planning, repository publication, and any later capability execution are distinct transitions. Success at one transition never implicitly authorises the next.
3. **Project only managed state.** User and repository capability activation may replace only a structurally recognised KI-managed target. Existing unrecognised content, links, malformed paths, and containment escapes fail closed; idempotent managed projections remain safe to refresh.
4. **One host-owned transaction.** Native conform gathers declared, serialisable repair plans from selected skills, validates containment and the pre-write snapshot, publishes atomically in dependency order, rolls back on a later failure where safe, and re-audits after publication. Skills neither write directly nor own a second transaction.
5. **Dry run is observational.** It resolves the same providers and repair plans, but changes no repository, user, cache, or installation state.
6. **Name actionable drift.** Diagnostics distinguish missing, altered, stale, conflicting, unmanaged, untrusted, and incompatible state. They identify the safe recovery route without silently reconciling or deleting user content.
7. **Preserve the payload boundary.** Installed harnesses remain regular, physically contained, integrity-checked payloads. Do not weaken nested-link validation; materialise source shared modules as regular verified files at acquisition, or eliminate the source links before execution.

## Explicit non-transfer

Do not revive the former proposal's generic `ki package` grammar, `.ki-lock.toml`, content-addressed multi-version package store, harness-adapter layer, ZIP-bundling model, broad command tree, or proposed exit-code catalogue.

Those are either superseded by the delivered CLI surface and FND-004, or intentionally unadopted.

## Acceptance evidence

CLI-004 should have fixtures proving: contained definition loading; dependency order; rejection of malformed, linked, altered, unavailable, or duplicate providers; byte-identical dry run; safe transaction refusal after a concurrent replacement; rollback/recovery behaviour; and post-conform re-audit.

The first harness integration slice is `ki-handoffs`, whose one repository-local Markdown-frontmatter repair will exercise this contract without subprocess, network, GitHub, or user-home effects.
