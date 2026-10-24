---
title: Resolution-target check rejects area-coded targets without declared areas
---

# Resolution-target check rejects area-coded targets without declared areas

Hand-in from va-principal, found on 24 October 2026. Triage into a roadmap record or delete once actioned; see [the working area README](./README.md).

## Finding

The `resolution_target` check in `src/core/work/items.ts` (around lines 477 to 488) builds the allowed namespaces from the repository's declared `areas`. When a repository declares none, the only allowed namespace is the bare repository code, so an area-coded target in the same repository is rejected as if it were in another repository.

In va-principal, which then declared no areas, the cancelled VA-PRINCIPAL-GOV-003 named `resolution_target: VA-PRINCIPAL-GOV-012`. `ki repo roadmap summary` reported that the target "must name a record in the same repository" and left the record uncounted, though both records are va-principal's own. Declaring `GOV` and `KNW` in va-principal's `.ki.toml` has since cleared it there.

## Proposed change

With no declared areas, also accept a `<repo_code>-<area>` target in the same repository, for example by deriving the namespace from the record's own `area` field or by matching any `<repositoryCode>-<AREA>` prefix, rather than only the bare repository code.
