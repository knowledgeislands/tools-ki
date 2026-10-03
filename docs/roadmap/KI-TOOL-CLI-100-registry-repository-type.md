---
id: KI-TOOL-CLI-100
area: CLI
title: Registry repository type
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-03T02:36:15Z
updated_at: 2026-10-03T02:54:31Z
---

# Registry repository type

## Goal

The machine-readable registry inventory says whether each registered repository is a Knowledge Base or a Project, so consumers can find Knowledge Bases without reading each checkout's declaration themselves.

## Context

`ki registry list --format json` emits `ki/registry/v1` from `src/core/storage/registry-report.ts`. Each entry carries `key`, `identity`, `repository`, `state`, `title`, `description`, `repoCode`, and `visibility`; an unavailable entry keeps the same keys with `null` metadata. The repository kind is declared as `[skills.ki-repo].repo_type` with the values `"project"` or `"kb"`, validated by `declaredRepositoryKind` in `src/core/configuration/declaration.ts`. `declaredRepositoryMetadata` already validates `repo_type` through `declaredRepositoryIdentity`, so every available entry has a valid type that the report then discards.

`REGISTRY-005` in `docs/specs/registry.md` requires `ki/registry/v1` to carry canonical identity and declared metadata without local paths. The tests `projects registered declaration metadata without exposing local paths` and `marks mismatched and malformed repository declarations unavailable in JSON inventory` in `src/tests/cli/registry/registry.test.ts` pin the exact entry shape. The `registry list` description in `man/ki.commands.json` and `man/ki.1` names the contract.

The local Knowledge Islands Observatory's Knowledge Base viewer needs this field. It currently reads each checkout's `.ki.toml` to find Knowledge Bases. That works around the gap but breaks the Observatory's rule of consuming `ki` machine contracts rather than re-deriving them.

The owner has decided the versioning question. `ki` is prerelease, so the field joins `ki/registry/v1` additively and there is no `v2`. `REPO-OPS-017` in `docs/specs/repository-operations.md` is the precedent: `ki/roadmap/v1` gained `taskLinks` additively without a schema bump.

## Boundary

In scope: one repository-type field in each `ki/registry/v1` entry, its tests, and the matching contract documentation. Excludes: `primary_shape` or other declared overlays, a `ki/registry/v2` schema, new registry filters such as listing Knowledge Bases only, changes to text-format `registry list` output, and the Observatory-side change that consumes the field.

## Shaping

- Approach: read the type through `declaredRepositoryKind` in `registryReport` and add `repoType` to the `RegistryReport` entry type and both available and unavailable branches. Test `project` and `kb` available entries and the exact `null` shape for missing or malformed declarations. Update `REGISTRY-005` to name the field and additive precedent, update the `registry list` entry in `man/ki.commands.json`, `man/ki.1`, the `ki registry list --format json` passage in `docs/guides/user/repository-operations.md`, and add a `CHANGELOG.md` entry.
- Dependencies: none. The declaration validation and registry report already exist.
- Decisions settled: use `repoType` (matching the report's camelCase `repoCode`) with declared values `project` and `kb`; use `null` for an unavailable entry (matching its other metadata keys). The owner confirmed both choices on 2026-10-03.
- Promotion: the scope and decisions are ready for Next selection; shape the execution plan and seek Ready approval there.

## Discussion

### Value vocabulary

Project the declared values `project` and `kb` unchanged rather than inventing display labels, so consumers compare against the `.ki.toml` vocabulary. An available entry always has a valid type because declaration validation already requires it. Only the unavailable state needs a representation decision.

### Consumer migration

When the field ships, the Observatory can drop its direct `.ki.toml` read and select Knowledge Bases from the registry contract. Treating a missing field as an older `ki` lets the Observatory report the gap rather than misclassify repositories.
