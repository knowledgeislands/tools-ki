---
id: KI-TOOL-CLI-030
title: Fail loudly on empty selection
theme: cli
horizon: now
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make a repository operation that selects no repository say so and exit non-zero, so that a governance sweep cannot report success over work it never performed.

## Context

`ki repo audit` invoked without `--repo` inside some registered repositories produces no output at all and exits `0`. The same command with `--repo .`, from the same working directory, resolves the repository and audits it normally. The failure is therefore in default selection rather than in the audit, and it presents as a clean, silent success.

That presentation is the defect. A governance command whose whole purpose is to report findings has exactly two safe outcomes — findings, or a stated clean result against a named repository. Producing neither, while exiting `0`, is indistinguishable from a passing audit to a person, a script, or an agent, and it is the shape most likely to be believed.

It was found during the estate-wide Markdown toolchain migration. A conform loop reported success across every repository, and two of them — `er-research` and `kit-techmedix` — had not been touched at all: their configuration files were still present afterwards. The loop believed them done because the exit code said so. Every repository in that sweep had to be re-checked by inspecting the filesystem, because the tool's own report could not be trusted to distinguish "audited and clean" from "never audited".

## Boundary

This item owns default repository selection and how an empty selection is reported. It does not change what an audit checks, the rubric contract, findings, or the reporting format for a non-empty selection. It does not change explicit `--repo` or `--agora` behaviour, both of which already work. Whether the underlying resolution is *correct* for these repositories is a separate question from whether an empty result is *reported*; this item fixes the reporting unconditionally, and fixes resolution only where the cause turns out to be a defect rather than a legitimate absence.

## Current state

The observable behaviour, measured in `/Users/krisbrown/workspaces/kit/equalremedy/er-research`:

- `ki repo audit --skill ki-authoring` — no output, exit `0`
- `ki repo audit --repo . --skill ki-authoring` — resolves and reports `PASS=1 WARN=0 FAIL=0`

`kit-techmedix` behaves identically. `kit-midnight.ninja` does not: the bare form works there.

What has been ruled out is more useful than what has not. All three repositories are listed under `[repositories].paths` in `~/.config/ki/config.toml`, so registry membership is not the discriminator. All three appear in an Agora profile. All three declare `ki-authoring` through the same fully-qualified key, sit at their own Git root, and resolve to a real path with no symlink indirection. The distinguishing factor was not identified from the outside, and diagnosis belongs in this repository.

The `--repo` option defaults to `[]`, so the bare form takes some other resolution path; that path is where the investigation starts.

## Steps

- [ ] Reproduce against `er-research` and `kit-techmedix`, contrasting with `kit-midnight.ninja`, and identify what makes default resolution return an empty set for the first two.
- [ ] Make an empty repository selection a loud, non-zero outcome for every `ki repo` operation, naming what was searched and why nothing matched. This lands regardless of the resolution diagnosis, because an empty selection is never a success.
- [ ] Fix the resolution defect if the cause is one, or state the rule that legitimately excludes those repositories and make the message explain it.
- [ ] Audit the other commands for the same shape — any operation that can complete having acted on nothing and exit `0`.

## Files touched

- The repository selection and default resolution path behind `ki repo`.
- The reporting layer that renders an operation summary and decides its exit code.

## Verify

`ki repo audit` inside `er-research` either audits it or fails with a message naming the repository and the reason, and in no case exits `0` silently.

A repository that is genuinely outside the selection produces a non-zero exit and a message a reader can act on without consulting the source.

The regression test asserts the exit code and the message on empty selection, not merely that resolution now succeeds — the silent-success shape is the defect, and it would return the moment resolution breaks again for any other reason.

## Dependencies / blocks

Nothing blocks this item. It was raised from `ki-agentic-harness` during `KI-HARNESS-FND-010`; that repository owns no part of the fix.

## Discussion

### Why the reporting fix is separable from the resolution fix

The resolution cause may turn out to be legitimate — a rule that properly excludes those repositories. Even then the behaviour is wrong, because the tool never says so. Fixing the report is therefore unconditional and worth landing first; fixing resolution depends on what the diagnosis finds. Sequencing them the other way round would leave the dangerous shape in place for every future cause of an empty selection.

### The failure class

Three separate failures during the migration that raised this all presented as clean, zero-exit results: this one, a rule-selection flag that silently disabled every rule but one while reporting success, and an autofix that corrupted files and then reported them clean. A tool that reports success while doing nothing costs more than a tool that fails, because the failure is discovered later and by someone who has already relied on it.
