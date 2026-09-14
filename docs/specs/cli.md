# CLI host — CLI

This area specifies the public root interface of `ki`; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Command discovery and errors

### CLI-001 — Universal command help

`ki` MUST provide help at the root and every public nested command path.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/help.test.ts` — `prints root and nested command help through universal --help`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### CLI-002 — Closed public command grammar

`ki` MUST reject unknown root subcommands and options before rendering root help.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/unknown.test.ts` — `rejects unknown root subcommands and options before root help`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### CLI-003 — Version identity

`ki --version` MUST report the package version as a global option.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/version.test.ts` — `reports the package version as a global option`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Failure boundary

### CLI-004 — Unexpected errors remain failures

`ki` MUST rethrow an unexpected command error rather than mapping it to a normal CLI exit result.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/run.test.ts` — `rethrows unexpected command errors instead of mapping them to an exit code`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
