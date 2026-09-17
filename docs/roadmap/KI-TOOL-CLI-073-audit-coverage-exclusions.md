---
id: KI-TOOL-CLI-073
area: CLI
title: Audit coverage exclusions
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T06:46:58Z
updated_at: 2026-09-17T06:46:58Z
---

# Audit Coverage Exclusions

## Goal

Make every product-code coverage exclusion trustworthy by proving its branch is unreachable through every supported caller, replacing reachable exclusions with CLI contract evidence, and removing unsupported dead code.

## Context

The 2026-09-17 repository engineering review confirmed 860 CLI-facing tests and 100% measured statement, branch, function, and line coverage, but found 116 opening `v8 ignore` directives across product code. Fifty carry no inline reachability rationale. A green percentage therefore proves only the instrumented surface until each excluded branch has whole-call-graph evidence under the repository-local `SELF-TEST-002` contract.

## Boundary

Review every opening `v8 ignore` against all callers and supported CLI inputs. Add or strengthen CLI-seam tests for reachable behaviour, remove unsupported unreachable branches, and retain only narrow exclusions with adjacent complete justification. Preserve public command behaviour and use interface-level fault injection only for documented failures that one in-process CLI invocation cannot produce. Do not convert the audit into arbitrary coverage-comment churn or internal unit testing.

## Discussion

Start with the 50 unexplained directives, but treat explained exclusions as claims to verify rather automatic passes. Group work by domain so call graphs and contract tests remain reviewable. The item is captured in Triage only; this review does not adopt, prioritise, or begin it.
