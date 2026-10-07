# Run detached background agents

This guide shows how to delegate work to detached Claude Code or Codex agents with `ki agent`, keep a queue of them moving, and know when each one finishes. The [`ki-delegation` background-run standard](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/governance/ki-delegation/references/standards-background-runs.md) owns the contract; `ki agent` is its reference launcher. Exact grammar is in `ki agent --help` and `man ki`.

## Before you start

- The canonical Harness is installed or linked with `ki dev local on`, so the `ki-delegation` footers and prompt skeleton resolve.
- The `claude` or `codex` executable is on `PATH`.
- Set `TZ` to the owner's time zone if the host default is not it; status lines and decision dates use it.

## Record the authority and write the prompt

1. Record the owner's approval: `ki agent decide <run> "<the owner's words>"`. It prints the decision number.
2. Write a skeleton with `ki agent new <run> <name>` and complete it: the task citing that decision, numbered steps, a verification step and the report path.
3. Choose the lowest sufficient authority tier: `none`, `push`, `prune` or `release`. Name every remote call the task relies on in the prompt itself.

## Launch one agent

```sh
ki agent launch <run> <name> <workdir> <prompt-file> --rules push --add-dir <dir>
```

The launcher appends any wait gate, the tier's footer and the progress protocol, then starts the agent in its own session with standard input from `/dev/null`. The run packet lives under `$KI_STATE_HOME/agents/<run>/`: `<name>.prompt.md`, `.status`, `.pid`, `.log` and `.report.md`.

Use `--wait-for <other>` when an agent must not start its work until another agent in the run writes `DONE`. Parallel agents in one repository each need their own Git worktree as `<workdir>`.

## Keep a queue moving

1. Queue ready-made prompts in priority order: `ki agent queue <run> <name> <prompt-file> --workdir <dir> --rules push`.
2. Start the dispatcher once: `ki agent dispatch <run> --max 4`. It launches the next queued agent as soon as any running one finishes, logs each launch to `dispatch.log`, and exits when the queue is empty and nothing is running.
3. Arm the waiter in the background: `ki agent wait <run> --next`. It returns `<name> finished: <last status>`, or that the agent exited without `DONE`, and marks that agent seen.
4. On each wake, read the agent's report, tell the owner the outcome, and re-arm the waiter. Stop re-arming once it prints `ALL FINISHED`.

Reorder priorities by editing nothing but the queue order: queue new work last, or launch urgent work directly.

## Check on a run

- `ki agent status <run>` prints each agent's latest status, flags any agent that exited without `DONE`, and lists the queue.
- `ki agent watch <run>` prints one line every two minutes and ends with `ALL FINISHED`.

After an interrupt of your own session, run `ki agent status` before claiming anything is still running. Relaunch an agent flagged `EXITED WITHOUT DONE` rather than waiting for it.

## Recover

- **Already running:** `launch` refuses a name whose process is alive. Choose a new name or wait for it.
- **Missing assets:** update or relink the canonical Harness so its `ki-delegation` skill ships the run assets.
- **A queued launch failed:** the dispatcher logs `could not launch <name>` and moves on. Fix the cause and queue the agent again under a new name.
