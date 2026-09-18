---
id: KI-TOOL-CLI-074
area: CLI
title: Restore release governance
theme: cli
horizon: waiting-for
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T06:51:55Z
updated_at: 2026-09-18T03:50:38Z
---

# Restore Release Governance

## Goal

Restore a green immutable-release governance path in which the released `ki`, its canonical Harness archive, the repository contract it audits, and CI all agree throughout the release cutover.

## Context

The 2026-09-17 release-readiness review found seven consecutive failing `main` CI runs through run `35190134780` at `e4d6140`. CI installs released `ki` v0.3.6, whose immutable canonical Harness pin is commit `65a223ca9c6d6f8f5b9b48c52e121f1e412d7e71` with archive digest `84244d24d76278d45c1ff36535b38f03dfee3012b728b43a77905f1f43e7e790`. That Harness requires the earlier byte-exact `+/README.md` and `-/README.md` contract, while this repository conforms to the newer contract.

The current published Harness head is `460556d81f0d4d6dca9c195c088c6f5abe7547dc`, whose archive digest is `f2eab93cfd3b142a0f88cec32facfa0ed98151b3807abbbe2c505be01114310f`; its `ki-repo` implementation matches the repository's current working-area contract, but it does not yet include a dual-contract transition. However, simply reverting the READMEs for a bridge release and pinning that current Harness is not sound: released v0.3.6 would pass the old files, but the candidate using the new Harness would fail those same files before publication.

## Boundary

Design and verify an explicit bridge sequence that keeps every Harness archive immutable, preserves proof that a released executable governs the checkout, and leaves both the bridge candidate and subsequent repository state auditable. Update a canonical Harness revision or digest only from verified archive evidence. Do not remove the governance job, use a mutable branch archive, weaken `WORK-1` permanently, publish from a failing candidate, or claim current local-source evidence substitutes for released-tool CI.

## Waiting condition

Wait for a bounded `ki-agentic-harness` revision that temporarily accepts both the v0.3.6 working-area README contract and the current contract, with an explicit retirement condition after the tool release cutover. Creating or committing that sibling-repository task requires separate authority. Execution also requires explicit authority to push the bridge commit, publish the selected `ki` version, create its tag and release, and push the follow-up cutover.

## Discussion

### Required bridge sequence

1. In `ki-agentic-harness`, add narrowly bounded dual-contract `WORK-1` acceptance and tests, publish the immutable revision, and calculate its archive digest. Do not change either canonical README output: only the audit transition may accept the previous bytes temporarily.
2. In `tools-ki`, prepare a bridge candidate whose working-area READMEs use the v0.3.6-compatible bytes while `canonicalHarnessRelease` points to the transition Harness revision. Update the matching registry tests, version, changelog, help/completion/manual evidence, and release artifacts required by the release guide.
3. Verify the bridge commit twice: released v0.3.6 with its old Harness must govern the checkout, and the built candidate with the transition Harness must pass the complete repository and release gates. Push only after both pass and confirm CI is green.
4. Publish the bridge version through the immutable tag, GitHub release, installer, packaging matrix, and clean-install proof.
5. In a follow-up cutover commit, update CI to install the new released version and restore the current working-area READMEs. Verify the released executable now governs the checkout and confirm CI remains green.
6. After the estate no longer needs the previous README bytes, remove the temporary Harness acceptance through its own governed work and move the next canonical Harness pin beyond the transition revision.

### Why a tools-only shortcut fails

The default canonical Harness cannot be overridden in user configuration, and v0.3.6 deliberately rejects a release entry that reuses `knowledgeislands/ki-agentic-harness`. CI therefore cannot inject a newer canonical archive into the released binary. A tools-only README swap makes either the released audit or the candidate audit fail and does not constitute a releasable bridge.

### Return evidence

Re-evaluate this item when the transition Harness task has an approved immutable commit and digest and the release authority is explicit. At that point move the item to `next`, add the concrete release version and file-level execution plan, review readiness, and only then begin implementation.
