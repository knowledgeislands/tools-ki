---
id: KI-TOOL-KI-CLI-176
area: CLI
title: Git-style extension veneer
priority: medium
size: m
status: triage
blocks: [KI-TOOL-KI-CLI-177]
blocked_by: []
baseline_ref: null
created_at: 2026-11-05T02:20:48Z
updated_at: 2026-11-14T06:47:14Z
---

# Git-style extension veneer

## Goal

`ki` becomes a front door that other tools can extend without changing tools-ki: a command it does not know, such as `ki muninn granola import`, runs the `ki-muninn` executable found on `PATH` with the remaining arguments, and `ki -h` lists the extensions it finds, as Git does.

## Context

Kris proposed it on 5 November 2026 through personal.reg.assistant-terra (ATER-017, 01:45 GMT), agreed the longer-term shape (ATER-018), corrected the naming (ATER-021) and asked for it on the tools-ki roadmap as forward work (ATER-022, 01:49 GMT): "add this to the right roadmap, tools-ki's, as forward work". The lines sit in Principal `+/_WORK/ki.sop.main/messages.md`.

Each extension lives and is versioned with its owner, and `ki` keeps only the shared core. Today `src/cli.ts` turns an unknown subcommand into `error: unknown command '<name>'`; that is the point where dispatch would look for `ki-<name>`.

The first outside extension is `ki-muninn` (Muninn, Odin's raven of memory), the Inbox's capture CLI, in krisb/inbox `packages/`; its repository would be `tools-ki-muninn` if it graduates. `ki-huginn` (Huginn, thought) is reserved as a placeholder for curation.

## Boundary

Dispatch and listing only: no extension registry, installer, version negotiation or shared library for extensions, and no change to built-in commands. Splitting tools-ki's own subcommands into packages is KI-TOOL-KI-CLI-177. Building `ki-muninn` belongs to krisb/assistant.

## Dependencies / blocks

krisb/inbox must ship a `ki-muninn` executable for the first real extension; until then a test fixture stands in.

`ki acquire` can retire once `ki-muninn` holds both Granola and ChatGPT acquisition. As of ATER-023 (5 November 2026, 02:03 GMT) munin, then in krisb/assistant `prototype/munin/`, holds Granola acquisition for the assistant; ChatGPT is still outstanding. Retiring `ki acquire` needs a separate owner decision on how the Harness `ki-acquire`, `ki-acquire-chatgpt` and `ki-acquire-granola` skills follow.

## Discussion

### Precedence and safety

Built-in commands win over a same-named `ki-<name>` on `PATH`, as in Git, so an extension cannot shadow core behaviour. Open questions: whether `ki help <name>` forwards to `ki-<name> --help`, how `ki -h` marks an extension apart from a built-in, and whether `KiContext` passes anything (such as the resolved Harness path) to an extension through the environment.

### Testing

Exercise dispatch through `run(args, context)` with an injected `PATH` and process port, so no real extension runs in tests.
