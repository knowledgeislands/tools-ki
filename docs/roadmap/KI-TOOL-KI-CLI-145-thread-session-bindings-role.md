---
id: KI-TOOL-KI-CLI-145
area: CLI
title: Thread session bindings and role
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T21:28:02Z
updated_at: 2026-10-16T21:28:02Z
---

# KI-TOOL-KI-CLI-145: Thread Session Bindings and Role

## Goal

`ki thread start|resume|bind|show|check` binds a native Claude or Codex session to its logical thread and supplies the thread's identity and role at start, so that a session knows which thread it is and whether that thread is conversational, coordination or state-of-play; and `ki agent launch` starts background agents with a non-coordinator output style, so a run in a coordinating checkout no longer inherits the coordinator persona.

## Context

Kris agreed the session-identity plan under SESSION-IDENTITY on 16 October 2026, in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_THREADS/ways-of-working/decisions.md):

> Take the recommended option a) for PLAN-AGREE, THREAD-KEY, BINDING-HOME, SUPPLY-CHANNEL, NAME-AUTHORITY, RECORD-OWNERS, ROLE-FIELD and ROLE-STYLE (mechanism only); capture the three records and start Phase 1 after REPLY-FORMS lands.

The plan is Phase 2 of the [session-identity report](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_THREADS/ways-of-working/session-identity.report.md), as narrowed by the [reporting-forms report](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_THREADS/ways-of-working/reporting-forms.report.md): ROLE-STYLE decides the mechanism only, so the repository keeps its `outputStyle` selection and this record does not pass a style per session.

The agreed design this record implements:

- The thread key is `<repository name>/<checkpoint stem>`.
- The binding is one JSON file per thread at `~/.local/state/ki/threads/<repository>/<stem>.json`, never committed and never moved, with `key`, `repository`, `checkpoint`, `label` and `role` cached from the checkpoint (role with `role_from: "<checkpoint path>@<updated_at>"`), and `sessions`, each `{client, client_version, native_id, native_name, host, started_at, last_seen_at, state}` with state `live`, `ended` or `forked`.
- `ki thread start|resume <key> --client claude|codex` sets `KI_THREAD=<key>`, passes `--session-id` and `-n <label>` to Claude or `codex resume <id>` to Codex, and opens with the thread's resume line.
- The checkpoint label is authoritative; tooling sets the native name only at Claude start through `-n`, and Codex names are set by hand. `ki thread check` reads Codex names through read-only `thread/read` and reports name and role-cache drift; it never renames.
- `ki thread show` prints the resolved role and its source; the checkpoint always wins over the cache.
- `ki-checkpoint` validation accepts the `role` field, which [KI-HARNESS-GOV-199](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-199-thread-identity-role-native-sessions.md) adds to the standard and its rubric in Phase 1.

[KI-TOOL-KI-CLI-127](KI-TOOL-KI-CLI-127-agent-status-live-threads.md) lists live runs and could later show bound threads, but stays separate because it is about runs. [KI-HARNESS-GOV-189](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-189-move-thread-between-hosts.md) owns moving a thread between hosts; bindings are rebuilt on each host rather than moved. The hook that reads the binding is [KI-HARNESS-GOV-199](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-199-thread-identity-role-native-sessions.md) Phase 3, registered by [KB-DOTFILES-UE-096](/Users/krisbrown/.local/share/chezmoi/docs/roadmap/KB-DOTFILES-UE-096-thread-identity-hook-registration.md).

## Boundary

- In: the `ki thread` commands, the binding file and its tests; Claude through `--session-id` and `-n`, Codex through `codex resume` and read-only `thread/read`; role resolution and role-cache drift; `ki agent launch` running background agents with an explicit non-coordinator output style.
- Out: any write to a native session through the Codex app-server, such as `thread/name/set`; `ki agent launch` passing `--session-id` or recording it in the run packet, an optional later step; passing the output style per session, which ROLE-STYLE's option b) would have needed; moving bindings between hosts; the hook itself.

## Dependencies / blocks

Starts after [KI-HARNESS-GOV-199](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-199-thread-identity-role-native-sessions.md) Phase 1 has defined the `role` field. The ways-of-working thread dispatches it.

## Discussion

Open for planning: how `ki agent launch` selects the non-coordinator style in practice, through `--settings` or another flag, and verifying its per-session effect, which the session-identity research did not confirm; and whether `ki thread bind` from inside a session can learn its own native ID on Codex, where no environment variable carries it.
