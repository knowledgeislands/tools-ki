---
id: KI-TOOL-CLI-034
title: Correct remaining ignore justifications
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: 08a36373e395f7bb0828ef517823e3e704c93dfa
---

## Goal

Bring the remaining `/* v8 ignore */` justifications in line with the every-caller rule, covering the spans that turn out to be reachable and correcting the ones whose stated reason is wrong even where the span is genuinely unreachable.

## Context

`KI-TOOL-CLI-031` found one pragma whose justification held for one of seven callers. That prompted a sweep of all ninety-five sites in product code, which produced `KI-TOOL-CLI-032` and `KI-TOOL-CLI-033` — both live defects rather than coverage arithmetic — and the findings below, which are recorded here so the sweep's result is not lost between sessions.

Sixty-odd sites are sound: index-signature artefacts over an array or map just proved non-empty, TOCTOU rechecks after a successful `lstat`, and guards that honestly declare themselves as defending a future refactor. Those are not restated here. What follows is only what the sweep judged wrong.

### Reachable

**`src/core/transaction.ts:135`** — claims "Current was either a physical existing directory or created and rechecked above". False for a segment that already exists and is not a physical directory. `ensureCreateParent` walks the relative parent segment by segment, and nothing upstream inspects intermediate segments: `safeRelativePath` is purely lexical and `prepareScopedWrites` checks only the string shape and the scope allow-list. A repository whose `.claude` is a symlink — a common real arrangement — reaches the guard on a non-dry-run conform that creates beneath it.

**`src/core/transaction.ts:106`** — reachable on the dry-run path with a symlinked _intermediate_ component. `inspectCreateTarget` lstats only the first existing ancestor, and `lstat` resolves intermediate components, so for `a/b/x.md` where `a` is a symlink to an outside directory containing a real `b`, the containment check passes and `realpath` then reports a path outside the repository. `publishOne` masks this because `ensureCreateParent` throws first, but `validateOne` calls `inspectCreateTarget` alone.

**`src/core/agora.ts:120`** — claims `realpath()` always yields a basename. `basename('/')` is the empty string, and `physicalProject` accepts `/` because it is an existing physical non-symlink directory. `ki agora add <name> /` reaches the guard. **Confirmed and closed** in the same pass that raised this record: the pragma is gone and `ki agora add inventory /` is asserted. The guard's diagnostic was already the right one, so this was coverage only, with no behaviour to decide.

### Wrong reason, unreachable span

**`src/commands/bootstrap/index.ts:98`, `:109` and `src/commands/dev/index.ts:134`** all justify themselves with "Fixture archives cannot match the pinned canonical SHA-256", and the sweep judged that there is no pinned canonical SHA-256 in `src/`. **That judgement was wrong** — see the Review. `src/core/registry.ts:50-54` holds the pin, and `readHarnessRegistry` prepends it so configuration cannot override it. The claim was accurate; only its wording, which named no pin, invited the doubt.

**`src/commands/dev/index.ts:78`** — the claim is false and the pragma is inert: both arms of the ternary it guards are already asserted by existing dev tests. It should simply be deleted.

**`src/core/runtime.ts:460`** — the pragma lands on a `.sort()` comparator rather than on any fallback, suppressing function coverage for real ordering logic. Either the comparator is uncovered, in which case a rubric with two automatic-remediation items across different phases should cover it, or it is covered and the pragma is misplaced and misdescribed.

**`src/commands/repo/repair.ts:64`, `:66`** — the per-skill guards are pre-satisfied by repair's own filtering, but `linkManagedSkill` also validates the containing `.claude/skills` directory, about which projection state says nothing. A repository whose `.claude/skills` is itself a symlink would reach these non-concurrently, unless `inspectRepositoryHealth` classifies that arrangement earlier — which needs confirming, and if it does, the justification should name it instead of concurrency.

## Boundary

This item owns the pragmas listed above and the coverage of whatever they turn out to hide. It does not revisit the sound sites, change path-safety, conform, bootstrap, dev, or repair behaviour beyond what covering a reachable guard requires, and it does not alter the archive pin. Where a guard proves reachable and its behaviour is wrong, that behaviour is a separate record rather than a fix smuggled in here — as `032` and `033` were.

## Current state

Every finding above is from static analysis of the call graph, not from a failing test. Each needs confirming against a real invocation before it is acted on: the sweep was deliberately suspicious, and a justification that reads as false may still describe a span no input reaches for a reason the analysis missed.

## Steps

- [x] Confirm each reachable finding with an actual CLI invocation before changing anything, and record any that do not reproduce.
- [x] Cover the two remaining reachable spans in `transaction.ts`, removing their pragmas, and decide separately whether the behaviour each guard produces is the behaviour wanted.
- [x] Replace the three SHA-256 justifications with the true reason those spans are uncovered, and cover them if a fresh-install fixture is in scope.
- [x] Delete the inert pragma in `src/commands/dev/index.ts`.
- [x] Establish whether the `runtime.ts` comparator is covered, then either cover it or move and reword the pragma.
- [x] Settle the `repair.ts` question by checking whether repository health classifies a symlinked skills directory first.

## Files touched

- `src/core/transaction.ts`, `src/core/agora.ts` — the reachable guards.
- `src/commands/bootstrap/index.ts`, `src/commands/dev/index.ts`, `src/core/runtime.ts`, `src/commands/repo/repair.ts` — the incorrect justifications.
- `src/tests/cli/` — coverage for whatever proves reachable.

## Verify

`bun run test:coverage` at 100% on all four metrics with fewer exempted lines than before. Every justification that survives states a reason true of every caller of the function it sits in, and no justification refers to a mechanism this codebase does not have.

## Dependencies / blocks

Nothing blocks this item. It completes the sweep begun by `KI-TOOL-CLI-031` and continued by `032` and `033`.

## Review

Six pragmas removed and three reworded; coverage is 100% on all four metrics across 4937 statements, with `tsc --noEmit` clean and `ki repo audit` at PASS=14 FAIL=0 WARN=0.

**Both `transaction.ts` findings reproduced, but not by the route the record proposed.** A symlinked _immediate_ parent is refused by `inspectCreateTarget`'s own `lstat` before either guard is reached, so the `.claude`-is-a-symlink shape in the Context section does not in fact get there. What does is a symlinked _intermediate_ segment — `linked/sub/created.txt` where `linked` is a symlink and `sub` is a real directory beneath it. `lstat` resolves the components above the one it reports on, so the link is invisible to classification. Pointed outside the repository it reaches `inspectCreateTarget`'s containment check on the dry-run path; pointed back inside it passes containment and is caught instead by the segment walk in `ensureCreateParent`. Both refusals were left as they stand: refusing to write through a symlinked directory is the intended policy, and the diagnostic is shared across every guard in the pair, so rewording it for the inside-pointing case is a behaviour change belonging to its own record.

**The three SHA-256 justifications were right about the mechanism and the record was wrong.** `src/core/registry.ts:50-54` pins the canonical release's URL and `sha256`, and `readHarnessRegistry` prepends that entry to any configured releases, so `installHarness`'s `find` always selects the pinned one — a configured entry for the canonical identifier cannot shadow it. A fixture archive therefore can never verify as the canonical harness, and no sandbox can reach a successful fresh canonical install. This was established by removing all three pragmas, measuring, and then building the fresh-install test the record called for and watching it fail on exactly that digest. The spans are genuinely unreachable; the justifications now say so in terms of the pin rather than an unnamed one, and each cites the file that holds it.

**`repair.ts` resolved against the record's own doubt.** `inspectRepositoryHealth` classifies the projection path, never the directory containing it, and `lstat` resolves that container — so a repository whose `.agents/skills` is a symlink reads as an ordinary missing projection, is classified `repairable`, and only fails once `linkManagedSkill` validates the container. Both pragmas removed and covered by a CLI test.

**Two pragmas were simply inert.** The `runtime.ts` comparator and `reportProjections` in `src/commands/dev/index.ts` were both already fully exercised; removing them changed no metric. The `runtime.ts` one is the more instructive: it sat on a `.sort()` comparator and would have suppressed function coverage for real ordering logic had that logic ever gone untested.

## Discussion

### Why the sweep was worth running despite the convention

The convention added to `AGENTS.md` catches this at the point an ignore is written or a caller added, which is cheaper than an audit. It does nothing about the pragmas already present, and two of those were hiding live user-facing defects — a silent partial skill removal and a half-completed uninstall. A convention prevents the next one; only a sweep finds the existing ones.

### What the sweep says about the pattern

Of the justifications that proved wrong, none were careless. Each was true when written and about the caller its author had in mind. They failed as the code around them changed: a second caller appeared, a verification moved from a pinned digest to a fetched manifest, a function was split so the parser and the text editor no longer agreed. That is why the rule is worth re-checking when a caller is added, rather than only when a pragma is written.
