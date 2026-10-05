# Definition of done for tools-ki

Use this guide before presenting a `tools-ki` change for review. Release publication has additional requirements in [Release tools-ki](releasing.md).

Apply the `ki-repo-tools` change-readiness checklist for shared documentation, verification, and authority requirements, and `ki-git` for commit practice. The checks below are KI's local additions.

## Confirm the delivery boundary

- Public grammar, validation, repository effects, and rendered output retain the command/core/presentation boundaries in the repository-local `ki-self` standard.
- Portable behavior belongs to its owning Harness skill or KI Specification rather than a `tools-ki`-only compatibility path.
- New provider, filesystem, time, stream, or network behavior enters through `KiContext` or an explicit domain port.
- Core modules do not import command grammar; CLI contract tests reach product modules only through the shared sandbox; runtime modules cannot import fixtures. The dependency-boundary suite checks a resolved graph with a supported isolated TypeScript compiler and proves a deliberately violating type-only import fails.

## Align the public surface

- Regenerate `man/ki.commands.json` with `bun scripts/generate-command-inventory.ts --write` after changing manual grammar.
- New accepted behavior has an executable contract test through `run(args, context)` and the sandbox helper.
- Error paths fail before partial writes and are covered at the public seam. Tests use injected provider fixtures rather than live network access.

## Verify the change

For diagnostic changes, exercise both `diag` and `doctor` with isolated checkout, linked-entrypoint, worktree, and copied-source fixtures plus injected host/runtime facts. Confirm default diagnostic redaction, proven local/release/unknown reporting, normalized host names, and doctor verdict/count agreement through the public CLI seam; keep freshness outside the health claim.

Run focused tests while iterating, then the complete engineering gate:

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd tooling/boundaries
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
