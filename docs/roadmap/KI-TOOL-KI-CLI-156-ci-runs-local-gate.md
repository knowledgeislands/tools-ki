---
id: KI-TOOL-KI-CLI-156
area: CLI
title: CI uses compatible KI
kind: deliver
purpose: corrective
project: tools-burndown
component: dev
priority: medium
size: s
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: d6e8f369fac456de387298cae060058471970705
created_at: 2026-10-19T08:04:00Z
updated_at: 2026-10-21T03:51:18Z
---

# KI-TOOL-KI-CLI-156: CI Uses Compatible KI

## Goal

Push and pull-request CI audit the current repository with a compatible published KI release and its immutable Harness, keeping the native audit as the sole Biome, TypeScript and coverage gate.

## Context

The original hypothesis that CI omitted Biome was disproved by the read-only Actions investigation. The successful pre-cleanup run at `949ff51267ab7ef8714ba8c693b185512138d3c5` already used the native audit. Offline Biome 2.5.15 reproduction of that exact source produces 26 warnings and 15 infos, with exit zero for both the local and audit commands. Repeating those commands would still pass.

Current-head CI at `d6e8f369fac456de387298cae060058471970705` instead fails because `KI_VERSION=v0.11.3` installs Harness revision `fdbb73d883db75a9f42a7aaa77a5b609dc3d38a9`: its Husky requirements and roadmap field vocabulary precede the current repository. Installation succeeds, Audit fails, and manual lint is skipped.

The coordinator's 21 October 04:36 BST decision selected the observed-pin repair and delivery, preserving CI-2. Warning/info strictness remains unchanged; no Harness policy change or duplicate-check exception is authorised.

## Boundary

Change the released KI pin in `.github/workflows/ci.yml`, add a workflow shape guard, and update this existing record. Preserve the verified installation, native audit and manual lint sequence. No `release.yml`, native audit implementation, Harness policy, bootstrap archive/digest, dependency, hook, Biome rule, diagnostic severity or public grammar changes.

## Current state

Immutable execution baseline: `d6e8f369fac456de387298cae060058471970705`. The unchanged local test, TypeScript, Biome and complete governance gates pass using the installed dependency set and isolated offline home. Existing local CI-1 and MATURITY-1 warnings are recorded without editing their files; Biome has one informational finding.

Published `v0.12.0` is backed by [Release run 39343624861](https://github.com/knowledgeislands/tools-ki/actions/runs/39343624861), including [successful clean Linux installation](https://github.com/knowledgeislands/tools-ki/actions/runs/39343624861/job/118371734807), at release source `056ef85f825edf4a4de7d79bb1d8c025e752af03`. Its immutable Harness is `f4d6c521ef4859dc8965579bc39a5575004e3ac5`, archive digest `004d7fa408e63036558879ef101207b7f71b6567b3a35383da4a570d0e6e07f9`. Both release lockfiles match the installed dependency set. The exact released CLI source and pinned Harness pass a full offline audit of the unchanged execution baseline, with existing PKG-6, CI-1 and HOOK-4 warnings and no failures. No archive or toolchain was downloaded.

The [failed current-head run](https://github.com/knowledgeislands/tools-ki/actions/runs/39538420966) and [build job](https://github.com/knowledgeislands/tools-ki/actions/runs/39538420966/job/119020343906) are prior-head evidence, not candidate proof. The [successful historical run](https://github.com/knowledgeislands/tools-ki/actions/runs/39213075868) and [build job](https://github.com/knowledgeislands/tools-ki/actions/runs/39213075868/job/117930615450) establish that non-failing diagnostics passed the existing audit.

The coordinator designates wow-night-cli-156-d as the sole tools-ki writer; its mandated isolated worktree is the roadmap writing checkout for this run. The predecessor's committed outcome and Ready offline planning record were inspected before relying on the launch gate.

## Steps

- [x] Read exact Actions heads, jobs, logs, installed release and Harness evidence; reproduce the historical diagnostics offline.
- [x] Verify the published replacement and its exact local release source/Harness against the unchanged green baseline.
- [x] Pin CI to `v0.12.0` and guard its verified-install, single-audit, manual-lint shape with no repeated tool/test steps.
- [x] Exercise the pinned native audit offline with representative Biome, TypeScript and test defects; require each owning criterion to fail.
- [x] Run the complete required gate, review the bounded diff, commit by explicit path, integrate fast-forward and publish only this run's own safe range; inspect exact-head CI or explicitly retain a pending candidate run.
- [x] Prepare the complete awaiting-review packet without acceptance or pruning.

## Files touched

- `.github/workflows/ci.yml`: the published KI version pin only.
- `src/tests/ci-workflow.test.ts`: preserve the verified native-audit workflow contract.
- `docs/roadmap/KI-TOOL-KI-CLI-156-ci-runs-local-gate.md`: evidence, approved plan and review packet.

## Verify

Run `bun run test`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .` with the already installed dependencies and the isolated offline audit home. Run the chosen published runtime against its exact pinned Harness; record inherited warnings separately. Prove BIO-1, TSC-1 and TEST-5 each reject an intentional corresponding defect in disposable offline source fixtures. Preserve CI-2 without a new exception. No grammar, manual or product behaviour changes require regeneration or additional standalone coverage; the native full audit executes coverage.

Inspect the candidate's exact-head Actions workflow, job outcome and runtime/Harness identity after an authorised own-range push. A prior-head run never substitutes for an unrun candidate.

## Dependencies / blocks

None. Compatible published `v0.12.0`, its local source objects, the pinned Harness source and the matching installed dependencies exist. No network installation, Harness policy change or cross-repository implementation is required.

## Delegation

No background agents. The run performs this bounded delivery locally under the supplied read-only Actions and own-commit push grants.

## Documentation impact

### Decision Records

None; the coordinator's existing decision supplies the route.

### Specifications

None; native gate semantics are unchanged.

### Guides

None; contributor commands and release procedures are unchanged.

### Roadmap

This existing record only. No new identifier, acceptance or pruning.

## Review

### Delivered

The approved compatible-pin route is delivered from immutable baseline `d6e8f369fac456de387298cae060058471970705` in implementation commit `fcbaf5105eee4b6804a6e251781e454f2ff868d9`, fast-forwarded into main and pushed as this run's own range. CI installs published `v0.12.0` and its immutable Harness `f4d6c521ef4859dc8965579bc39a5575004e3ac5`, digest `004d7fa408e63036558879ef101207b7f71b6567b3a35383da4a570d0e6e07f9`. No warning/info policy change, duplicate gate, native audit implementation or release operation was introduced.

### Change Summary

- `.github/workflows/ci.yml` changes only the released KI version, from the incompatible `v0.11.3` to verified published `v0.12.0`.
- `src/tests/ci-workflow.test.ts` guards the compatible version floor, installed-version verification before exactly one audit and manual lint, and absence of repeated Biome, TypeScript or test steps.
- This record replaces the disproved missing-check hypothesis with immutable CI evidence, the coordinator-approved pin route, baseline, plan and delivery packet.

### Verification

The complete candidate test suite, TypeScript, Biome, manual lint and repository governance gates pass with installed dependencies. The full native audit executes and passes coverage. The exact released CLI source and pinned Harness also pass the unchanged baseline offline.

A disposable combined negative fixture proves the published native audit returns failure for each corresponding criterion: BIO-1 for formatting, TSC-1 for an incompatible assignment, and TEST-5 for an intentional failed assertion. Its extra unused probe exports also fail Knip. Historical warning/info reproduction returns zero as expected; diagnostic policy is unchanged. External IP traffic was denied, with loopback permitted solely for local installer fixtures. No dependency installation occurred.

[Implementation-head CI run 39540586660](https://github.com/knowledgeislands/tools-ki/actions/runs/39540586660) and [build job 119027163432](https://github.com/knowledgeislands/tools-ki/actions/runs/39540586660/job/119027163432) pass at exact head `fcbaf5105eee4b6804a6e251781e454f2ff868d9`. Installation, Audit and manual lint succeed. Saved logs verify `KI_VERSION=v0.12.0` and the pinned Harness digest above. The documentation-only review-packet follow-up's exact-head Actions result is recorded in the run report.

### Outstanding concerns

The published Harness retains baseline PKG-6, CI-1 and HOOK-4 warnings. Package and hook files are unchanged; CI-1 is the existing inline-pin location warning, with only the release value changed under the approved repair. No warning was suppressed or new exception invented. Linux CI also retains Capital/Project availability warnings TERR-3, ROUTE-1 and ITEM-2 because its isolated registry has no Capital checkouts; their source declarations and Project references are unchanged. The newer offline baseline Harness separately reports pre-existing CI-1 and MATURITY-1 warnings. Biome retains one informational finding. Independent acceptance remains outside this run.

### Post-change review

The repaired workflow now completes the native gate against the current repository using the verified published release. The earlier green audit did run Biome; its 41 non-failing warnings and infos explain the apparent missed gate. The pin-only workflow diff preserves verified acquisition, Biome-first native execution, TypeScript, coverage, CI-2 and manual lint. Product code and public grammar are unchanged. The bounded diff and post-hook commit paths were inspected; the record is ready for independent review, not accepted.

### Mini recap

The release/Harness mismatch is repaired and exact implementation-head CI passes. Both the baseline and deliberate failures support the chosen route. Historical diagnostic semantics and inherited warnings are recorded here; no new record or cross-repository policy change was created.

## Discussion

### The audit already claims these checks

The ki-engineering standard's Minimal CI rule says CI does not repeat a check the audit runs. The audit runs Biome (BIO-1, at FAIL), TypeScript and, under a root `vitest.config.*`, `bun run test:coverage`. Rubric item CI-2 warns when `ci.yml` repeats the test run. Read literally, CI's audit step should already have failed on the drift.

Planning should first find out why it did not, for example the pinned `KI_VERSION`, the harness the CI audit resolves, or a red CI nobody watched. Two routes follow:

- Add explicit `biome check .`, `tsc` and `bun run test` steps before the audit, as Kris chose. CI then fails fast with readable output, but repeats the audit's checks, and CI-2 warns.
- Make the audit's existing gate effective in CI and leave `ci.yml` without repeated steps. This keeps CI-2 clean but may need a harness or pin change outside this record.

If the explicit steps win, the standard needs an exception or a change in ki-agentic-harness, which this record would hand off rather than make.

### Route chosen

On 2026-10-19 Kris answered the tools-burndown summary with "All recommended", which took BIOME-CI-STANDARD a): keep this record, and have planning check the latest CI runs first. If the audit gate turns out to be broken, fix it rather than repeat its checks in `ci.yml`. The explicit-steps route above therefore applies only if the audit gate proves sound and still let the drift through.
