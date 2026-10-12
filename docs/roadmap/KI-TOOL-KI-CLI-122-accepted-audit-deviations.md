---
id: KI-TOOL-KI-CLI-122
area: CLI
title: Accepted audit deviations
project: baseline-rollout
status: cancelled
resolution: rejected
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-12T09:38:03Z
updated_at: 2026-10-12T19:57:12Z
---

# Accepted Audit Deviations

## Goal

A repository can declare in `.ki.toml` that it accepts a specific audit finding, giving the criterion code, a reason and a link to the decision that accepted it. `ki repo audit` then reports that finding as accepted rather than FAIL or WARN, so the repository's verdict reflects the owner's decision while the deviation stays visible. The mechanism belongs to the audit host and works the same for every rubric.

## Context

`tools-ki` hosts the rubric contract (`src/core/rubric/index.ts`) and computes each finding's status and level in `src/core/runtime/audit.ts`. Its audit statuses are `PASS`, `VIOLATION`, `NOT_APPLICABLE` and `INFO`, and nothing between a rubric's outcome and the verdict lets a repository record that a violation is accepted. Rubrics only advise recording "the owning design decision", so an accepted deviation still fails the audit indefinitely and blocks the green estate audit that the Baseline rollout Project is aiming for.

The first consumer is `apps-tower.midnight.ninja`. Kris accepted its `ki-repo-website-content` findings WEB-9 (source layout) and WEB-19 (Tailwind import pair) on 12 October 2026, along with the follow-on warnings WEB-20, WEB-26, WEB-30 and WEB-40. They are recorded in [`apps/site-tower/AGENTS.md`](https://github.com/krisb/apps-tower.midnight.ninja/blob/75e0698/apps/site-tower/AGENTS.md#accepted-deviations-from-ki-repo-website-content), but `ki repo audit` still reports WEB-9 and WEB-19 as FAIL.

## Boundary

- **In:** the `.ki.toml` declaration shape and its validation in `tools-ki`; matching declared deviations to findings by skill and criterion code, optionally narrowed to a subject; a distinct accepted status in human, JSON and progress output, with the reason and decision link shown; verdict and exit-code effects; reporting a declared deviation that no longer matches any finding; tests through `run(args, context)`; adopting the Tower declaration once the mechanism ships.
- **Out:** rubric content and per-skill marker tables, which `ki-agentic-harness` owns; the portable contract text, if it belongs in KI Specifications, which reaches that repository through a `ki-trades` work trade; any change to which findings a rubric emits; waiving checks in `ki-accept` or roadmap lifecycle gates.

## Cancelled

Kris approved rejecting this record on 12 October 2026 (state-of-play thread, Decision 147), accepting the triage review's proposal as written. Kris chose to conform Tower to the website standard rather than waive the audit (Decision 142) and judged an accepted-deviation mechanism too big an escape hatch (Decision 140). Tower now conforms: `apps-tower.midnight.ninja` revision `72b0bd1` audits with no failures. No outstanding changes remain.

## Discussion

- The declaration should sit in a host-owned table, such as `[[repo.accepted_deviations]]` with `skill`, `criterion`, `reason` and `decision` keys, rather than inside `[skills.<name>]`. Several rubrics, `ki-repo-website-content` included, fail a marker table that has unknown keys, so a per-skill key would need every rubric to change.
- Should acceptance be allowed for FAIL only, for both FAIL and WARN, or excluded for criteria a rubric marks as non-waivable, such as security or secret-handling checks?
- Does `decision` have to be a resolvable link (a Decision Record, an `AGENTS.md` anchor, a decisions log entry), or is free text enough? A pinned link survives later edits better.
- Should a stale declaration, one whose criterion now passes or no longer exists, warn so that acceptances do not outlive their reason? An optional `review_by` date is a lighter alternative.
- The `ki-agentic-harness` vendored aggregate renderer described in ADR-KI-HARNESS-SKILLS-010 may need the new status as well. Confirm whether it renders host output or its own stream before planning.
