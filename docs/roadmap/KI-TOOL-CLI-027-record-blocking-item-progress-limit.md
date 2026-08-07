---
id: KI-TOOL-CLI-027
title: Resolve blocking-item progress limit
theme: cli
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Record, and eventually resolve, the constraint that the live progress display can only advance while a rubric item yields the event loop, so that a future reader does not rediscover the limit by measurement or mistake the refresh timer for a defect in this repository.

## Context

`ki repo audit` and `ki repo conform` report item progress at both edges of each item and refresh the display on a timer between those edges, so the elapsed clock and the indeterminate sweep advance during a long item. The refresh is inert whenever the running item blocks the event loop, because a timer callback cannot be delivered while the loop is blocked.

Measured against a real `ki repo audit --skill ki-engineering` in this repository, the refresh timer registered once and fired zero times across 26.5 seconds of wall clock, where roughly one hundred and six firings were due. The corresponding frame capture showed eighty-eight frames carrying only three distinct clock values, jumping directly from `0.0s` to `30.5s`. Every frame emitted was an item-edge event; not one was a refresh.

The cause is outside this repository. Rubric items execute their subprocesses synchronously, so the host's `await` on an item never yields between the item starting and finishing. This repository already recorded the same mechanism from a different direction: a work item captured and then reverted for the concurrent-coverage race noted that the `ki-engineering` audit evidence context runs its checks synchronously, which is why one skill evaluation cannot overlap itself.

## Boundary

This item does not change the rubric contract, which is portable and owned elsewhere, and does not move item execution into a worker thread or child process to reclaim the event loop — that would be a large architectural change to the native operation host and is very likely the wrong answer to a presentation problem. It does not remove the refresh timer, which is correct and becomes effective as soon as an item yields.

## Current state

The refresh capability is injected as `startInterval` on the context, mirroring `onInterrupt`, and is started only for an interactive display because a plain stream would otherwise gain a line per refresh. Its behaviour is covered through the CLI seam by firing the captured handler.

An outbound work trade to the Harness proposes that rubric items avoid blocking the event loop, carrying the measurement above as evidence. The Harness owns whether and how to act, and this item does not assume a particular outcome.

## Steps

- [ ] Track the Harness's disposition of the outbound trade, and reconcile this item with whatever it decides rather than presuming adoption.
- [ ] If items begin to yield, confirm by measurement that the refresh fires at the expected rate and that the clock advances during a long item.
- [ ] If the Harness declines or defers, decide whether the host should say something explicit when an item has been running without yielding, so a frozen clock is at least attributable rather than ambiguous.
- [ ] Keep the measurement reproducible, so the constraint can be re-checked cheaply after any change to either side.

## Files touched

- `src/core/repository-reporting.ts` — the refresh and any attribution of a non-yielding item.
- `src/context.ts` — the injected interval capability, if its shape needs to change.
- `src/tests/cli/repo/` — coverage for whatever behaviour is added.

## Verify

Run an audit against a skill with a subprocess-backed item and count refresh firings against wall-clock time. Today that ratio is zero; the constraint is resolved when it approaches the configured interval, and the elapsed clock visibly advances while a single item runs.

Confirm that no change made here reintroduces a refresh on a plain stream, which would put one line per interval into a log.

## Dependencies / blocks

Nothing local blocks this item. Its substance depends on the Harness's decision about the outbound trade, which cannot be expressed in `blocked-by` because that field admits only local work-item identifiers. This record stays a `next` draft until that disposition is known.

## Discussion

### Why not reclaim the event loop locally

Running each item in a worker thread or child process would let the host refresh regardless of what an item does, but it would change the execution model of every rubric to solve a display problem, and it would introduce serialisation and failure semantics at a boundary that currently has none. The cost is out of proportion to the benefit.

### Why keep the refresh timer

It is correct, it is covered, and it costs nothing when it cannot fire. It already helps any item that performs asynchronous work, and it is the part that must exist before a yielding item can be shown advancing. Removing it would only have to be undone.
