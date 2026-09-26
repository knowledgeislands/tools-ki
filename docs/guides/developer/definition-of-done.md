# Definition of done for tools-ki

Use this guide before presenting a `tools-ki` change for review. Release publication has additional requirements in [Release tools-ki](releasing.md).

## Confirm the delivery boundary

- The implemented behavior matches the approved work scope and does not absorb unrelated working-tree changes.
- Public grammar, validation, repository effects, and rendered output retain the command/core/presentation boundaries in the repository-local `ki-self` standard.
- Portable behavior belongs to its owning Harness skill or KI Specification rather than a `tools-ki`-only compatibility path.
- New provider, filesystem, time, stream, or network behavior enters through `KiContext` or an explicit domain port.

## Align the public surface

- CLI help, completions, `man/ki.1`, README, user guides, specifications, and the active changelog baseline agree wherever the change affects them.
- New accepted behavior has an executable contract test through `run(args, context)` and the sandbox helper.
- Error paths fail before partial writes and are covered at the public seam. Tests use injected provider fixtures rather than live network access.
- Removed behavior leaves no dead aliases, compatibility branches, obsolete documentation, or unreachable implementation behind unless a bounded transition was approved.

## Verify the change

Run focused tests while iterating, then the complete engineering gate:

```sh
bun run test
bunx tsc --noEmit
bunx biome check
```

Run the repository governance gate:

```sh
ki repo audit --repo .
```

When behavior or coverage exclusions changed, also run:

```sh
bun run test:coverage
```

When the manual changed, update its date, lint it, and inspect the rendered result:

```sh
bun run ki:tools:lint-man
mandoc -Tutf8 man/ki.1 | col -b
```

## Prepare review

- Commit one coherent, verified unit with only intended paths staged.
- Record any unavailable check as a blocker rather than describing the change as fully verified.
- Name receiver-owned cross-repository follow-up without mutating the receiver opportunistically.
- Do not push, tag, publish, merge, deploy, or accept roadmap work unless that authority was supplied separately.
