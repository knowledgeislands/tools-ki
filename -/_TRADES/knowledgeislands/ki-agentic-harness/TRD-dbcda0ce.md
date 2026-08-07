---
id: TRD-dbcda0ce
title: "Specify observable, asynchronous evidence-gathering steps"
created_at: 2026-08-07T17:45:39Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: work
source_ref: "KI-TOOL-CLI-022"
observation: decision
phase: preparing
---
# TRD-dbcda0ce: Specify observable, asynchronous evidence-gathering steps

## Context

A skill's session gathers its evidence before any rubric item is evaluated, and the host can observe nothing while it does. Instrumenting `ki repo audit --skill ki-engineering` against tools-ki divides the operation as follows: loading the rubric definition takes 0.02 seconds, session evidence gathering takes 22.13 seconds, and the sum of all forty-two item durations is 0.00 seconds. Items are instantaneous because they inspect evidence the session has already produced, so every second of the operation falls inside a single block the host cannot describe. The display consequently shows nothing of forty-two items for the entire time the operation is working, which is indistinguishable from a hang. The `ki-engineering` collector runs six commands through one synchronous helper — `bunx @biomejs/biome check`, `tsc --noEmit`, `bunx syncpack format --check`, `bunx knip --no-config-hints`, `bun outdated`, and `bun run test:coverage` — and process sampling showed the last of these alive for thirty-three of forty-four samples, so a repository's own test suite dominates. None of that work is waste; it is the criteria doing what they are specified to do. It is only invisible, and because the helper is synchronous the host's refresh timer registered once and fired zero times across the whole period.

## Submission

Consider specifying that evidence gathering is decomposable into named steps whose start and completion are observable, and that each step's work is performed asynchronously so the host retains control between them. The two requirements reinforce one another rather than competing: an asynchronous step naturally yields at its await, and a step that yields is the point at which its completion can be reported, so making the work async is what makes it measurable rather than an extra cost on top. An event-emitting session, or an equivalent callback pair supplied when a session is created, would carry step transitions without the host inferring anything: the host already receives item edges through an `onItemStart` and `onItemComplete` pair and renders them, so the same shape applied one level up would need no new concept, and a session that emitted nothing would simply behave as today. With that in place the host could name the running check rather than an unchanging item count, report how many steps of how many have completed, and keep its elapsed clock advancing, all from information only the skill possesses. A step boundary is also the natural unit for a duration a host could learn and reuse, which per-item timing cannot supply because the items cost nothing.

## Constraints

The Harness owns the session contract, the shape of any emitter or callback, the step vocabulary, and whether this is worth specifying at all. This proposal deliberately does not name an API. Ordering is not being challenged: several checks may need to run in sequence, and asynchronous execution is asked for so that control returns between and during steps, not so that steps overlap. The host will render what a session offers and will infer nothing from silence, so a skill that adopts no steps must continue to work unchanged and simply report as it does today. This extends rather than replaces `TRD-d7d00505`, which asks only that work yield the event loop; yielding alone would let a clock advance, while named steps are what let the display say what is happening. tools-ki has recorded the host-side counterpart as `KI-TOOL-CLI-022`, and has already rejected reclaiming the event loop by moving execution to a worker or child process, on the grounds that it would alter every rubric's execution model to solve a reporting problem.
