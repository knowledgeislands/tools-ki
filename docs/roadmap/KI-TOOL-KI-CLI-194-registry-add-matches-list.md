---
id: KI-TOOL-KI-CLI-194
area: CLI
title: Registry add matches list
priority: medium
size: s
assignee: work/ki.tools
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-26T03:10:02Z
updated_at: 2026-11-26T03:10:02Z
---

# KI-TOOL-KI-CLI-194: Registry add matches list

## Goal

`ki registry add` refuses a declaration that `ki registry list` cannot read, naming what is missing, and `ki registry list` says why any entry it reports as unavailable is unavailable.

## Context

Two registry faults, both seen failing at tools-ki d1dfcc4c on 26 November 2026, run from source against a scratch state home:

- **Add accepts what list cannot read.** `ki registry add` checks only `[skills.ki-repo]`'s `repository` and kind (`declaredRepositoryIdentity` in `src/core/configuration/declaration.ts`). `ki registry list --format json` reads the fuller metadata (`declaredRepositoryMetadata`: `title`, `description`, `repo_code`, `visibility`). A `.ki.toml` with `[repo] backpacks`, `repository`, `repo_type` and `primary_shape` but none of those four was registered with exit 0, and list then reported it `"state": "unavailable"` with exit 1. Text `ki registry list` printed its path with exit 0, so the two formats disagree.
- **Unavailable without a reason.** `registryReport` in `src/core/storage/registry-report.ts` catches every error, including an identity mismatch, and returns `state: 'unavailable'` with every field null and no reason, so the error that names the missing field is lost.

Both were met on 14 November 2026, when family-principal's first declaration lacked `repo_code` and ki's registry read it as unavailable without saying why ([the walk-through's record](https://github.com/krisb/ki-cairn-store/blob/0fcaeeb81c3508f066768f018ae4948855c78f70/record/20261114T1635Z-the-walk-through-and-the-renames.md), "Left, for the tooling check"). They were then held on ki.summit as "Tool gaps on no roadmap" (RECORD-OPEN-POINTS, points 6 and 14; [ki.summit at 1eb84ae5](https://github.com/krisb/ki-cairn-store/blob/1eb84ae526e0f31e594ab6fb1bc876cd5997342c/work/ki/ki.summit/_index.md)), to be released when captured with ki.tools. They share one code path, so they are one record.

## Boundary

- **In:** `ki registry add` validating a declaration with the same reader `ki registry list` uses, and failing with that reader's message; an unavailable entry in `ki registry list --format json` carrying its reason, under the `ki/registry/v1` schema or a successor; text and JSON list agreeing on which entries are unavailable; tests for each.
- **Out:** what `[skills.ki-repo]` requires, which `ki-repo` owns; repairing existing registrations, which `ki repo conform` and the owner do.

## Dependencies / blocks

None.

## Discussion

Planning settles whether the reason is a new field in `ki/registry/v1` or a schema bump, how text list shows an unavailable entry, and whether `ki repo conform`, which also records a root, gets the same check. Captured as triage for Kris to adopt or cancel.
