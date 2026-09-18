---
id: KI-TOOL-CLI-074
area: CLI
title: Restore release governance
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 47d3617470f82d5227be3c48249a6cd7875717c9
created_at: 2026-09-17T06:51:55Z
updated_at: 2026-09-18T06:30:00Z
---

# Restore Release Governance

## Goal

Restore a green immutable-release governance path in which the released `ki`, its canonical Harness archive, the repository contract it audits, and CI all agree throughout the release cutover.

## Context

The 2026-09-17 release-readiness review found seven consecutive failing `main` CI runs through run `35190134780` at `e4d6140`. CI installs released `ki` v0.3.6, whose immutable canonical Harness pin is commit `65a223ca9c6d6f8f5b9b48c52e121f1e412d7e71` with archive digest `84244d24d76278d45c1ff36535b38f03dfee3012b728b43a77905f1f43e7e790`. That Harness requires the earlier byte-exact `+/README.md` and `-/README.md` contract, while this repository conforms to the newer contract.

The current published Harness head is `460556d81f0d4d6dca9c195c088c6f5abe7547dc`, whose archive digest is `f2eab93cfd3b142a0f88cec32facfa0ed98151b3807abbbe2c505be01114310f`; its `ki-repo` implementation matches the repository's current working-area contract, but it does not yet include a dual-contract transition. However, simply reverting the READMEs for a bridge release and pinning that current Harness is not sound: released v0.3.6 would pass the old files, but the candidate using the new Harness would fail those same files before publication.

## Boundary

Design and verify an explicit bridge sequence that keeps every Harness archive immutable, preserves proof that a released executable governs the checkout, and leaves both the bridge candidate and subsequent repository state auditable. Update a canonical Harness revision or digest only from verified archive evidence. Do not remove the governance job, use a mutable branch archive, weaken `WORK-1` permanently, publish from a failing candidate, or claim current local-source evidence substitutes for released-tool CI.

## Current state

`KI-HARNESS-GOV-075` is approved and ready to produce the bounded transition revision that temporarily accepts both the v0.3.6 working-area README contract and the current contract. The user has explicitly authorised the sibling change, bridge push, v0.4.0 tag and publication, and follow-up cutover. The tools release bridge begins only after the exact Harness commit and archive digest exist.

## Steps

- [ ] Implement and verify `KI-HARNESS-GOV-075`, then record its immutable commit and archive digest.
- [ ] Restore the two generic working-area READMEs to their v0.3.6-compatible bytes for the bridge candidate.
- [ ] Point `canonicalHarnessRelease` and its contract tests at the transition Harness archive.
- [ ] Set the candidate version to `0.4.0`, add the dated changelog release entry, and align help, completions, manual, installer, and packaging evidence.
- [ ] Prove released v0.3.6 governs the bridge checkout and the built v0.4.0 candidate governs it through the transition Harness.
- [ ] Run the complete engineering, repository, installer-link, packaging, and release-readiness gates.
- [ ] Push the verified bridge commit, confirm CI green, tag and publish immutable v0.4.0, and confirm clean installation.
- [ ] Update CI to install v0.4.0 and restore the current generic working-area README pair in a post-release cutover commit.
- [ ] Confirm released v0.4.0 governs the restored checkout and CI remains green.

## Files touched

- `+/README.md`
- `-/README.md`
- `src/core/storage/registry.ts`
- matching CLI contract tests under `src/tests/cli/`
- `package.json`
- `bun.lock`
- `CHANGELOG.md`
- `.github/workflows/ci.yml`
- public help, completion, and `man/ki.1` only if candidate verification exposes drift
- `docs/roadmap/KI-TOOL-CLI-074-restore-release-governance-compatibility.md`

## Verify

```sh
bun run test:coverage
bunx tsc --noEmit
bunx biome check
bunx knip
bun run build
bun run ki:tools:lint-man
./dist/ki --version
./dist/ki repo audit --repo .
ki repo audit --repo .
```

Also validate Bash and Zsh generated completions, disposable installer `--link` destinations, one native packaging target, the released-v0.3.6 bridge audit, green remote CI, immutable GitHub publication, and a clean exact-version installation before the post-release cutover.

## Dependencies / blocks

`KI-HARNESS-GOV-075` supplies the required transition commit and digest. Publication depends on green remote CI from the pushed bridge commit. The post-release cutover depends on immutable v0.4.0 publication and clean-install proof.

## Documentation impact

### Decision Records

None. Existing release and repository-governance decisions already determine the bridge.

### Specifications

No normative behaviour changes beyond the action-first and acquisition contracts already recorded.

### Guides

Keep the release-management guide accurate if executing the bridge exposes any missing release step.

### Roadmap

Record the transition Harness commit, archive digest, candidate evidence, publication evidence, and cutover evidence in this item. No delegation is planned because Harness pinning, working-area bytes, versioning, remote CI, publication, and cutover are serial authority boundaries.

## Discussion

### Remote bridge finding

Remote CI run `35308661890` proved two further immutable v0.3.6 differences: the predecessor `.gitignore` composition and the older roadmap schema, which rejects the now-mandatory `created_at` and `updated_at` pair. Harness commit `261569038e8c5811b87a99f7dd048a08357bb8cd` (archive SHA-256 `a0b3085ac56c447da685ca3e32dc0927d56351d7232a86a77f9f084dda568c72`) therefore adds byte-exact audit-only acceptance for the predecessor `tools-ki` `.gitignore`.

There is no shared work-item frontmatter satisfying both schemas. During the bridge only, released v0.3.6 CI audits the predecessor repository contract through `--skill ki-repo`; the candidate retains mandatory timestamps and is verified against the complete current contract. Post-publication CI returns to the complete audit with released v0.4.0.

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
