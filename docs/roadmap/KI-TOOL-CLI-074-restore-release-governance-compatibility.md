---
id: KI-TOOL-CLI-074
area: CLI
title: Restore release governance compatibility
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T06:51:55Z
updated_at: 2026-09-17T06:51:55Z
---

# Restore Release Governance Compatibility

## Goal

Restore a green immutable-release governance path by aligning the candidate CLI's canonical Harness pin, the repository contract it audits, and CI's proof that a released `ki` can govern the checkout.

## Context

The 2026-09-17 release-readiness review found seven consecutive failing `main` CI runs. The latest run, `35190134780` for `e4d6140`, installs released `ki` v0.3.6 and fails `ki-repo` `WORK-1` because its immutable canonical Harness pin is commit `65a223ca`, while `tools-ki` working-area READMEs conform to a later Harness contract. Local source gates and all 18 current declared-skill audits pass, but that does not replace the released-tool CI evidence required before publication.

## Boundary

Design and verify an explicit bridge release sequence that keeps the Harness archive immutable, preserves the released-executable governance proof, and leaves both the candidate and immediately subsequent repository state auditable. Update the canonical Harness revision and digest only from verified archive evidence. Do not remove the governance job, use a mutable branch archive, weaken `WORK-1`, publish from a failing commit, or claim current local source evidence substitutes for CI.

## Discussion

The likely sequence needs one old-contract-compatible bridge commit that can pass v0.3.6 governance, a release containing the new canonical Harness pin, then a CI version and repository-contract cutover proved by that release. Confirm the exact version and whether any other post-v0.3.6 Harness changes create compatibility constraints before planning. This item is captured in Triage only; no release, tag, push, or workflow mutation is authorised by the review.
