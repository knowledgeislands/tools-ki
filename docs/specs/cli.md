# CLI host — CLI

This area specifies the public root interface of `ki`; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Command discovery and errors

### CLI-001 — Universal command help

`ki` MUST provide help at the root and every public nested command path.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/help.test.ts` — `prints root and nested command help through universal --help`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### CLI-002 — Closed public command grammar

`ki` MUST reject unknown root subcommands and options before rendering root help.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/unknown.test.ts` — `rejects unknown root subcommands and options before root help`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### CLI-003 — Version identity

`ki --version` MUST report the package version as a global option.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/version.test.ts` — `reports the package version as a global option`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Failure boundary

### CLI-004 — Unexpected errors remain failures

`ki` MUST rethrow an unexpected command error rather than mapping it to a normal CLI exit result.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/run.test.ts` — `rethrows unexpected command errors instead of mapping them to an exit code`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Configured environment adoption

### CLI-006 — Configured canonical MCP inventory

`ki` MUST adopt an absolute `[mcp] inventory` path declared in `config.toml` as `KI_MCP_SOURCE` for its own process and every command it spawns, MUST leave a non-empty inherited `KI_MCP_SOURCE` unchanged, and MUST NOT require the named file to exist.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/mcp-inventory.test.ts` — `adopts the configured canonical MCP inventory without requiring the named file`, `leaves an inherited canonical MCP inventory in place and treats an empty one as unset`, and `adopts nothing from an absent, unreadable or mcp-free ki configuration`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### CLI-007 — Validated MCP inventory declaration

`ki` MUST refuse an `mcp` configuration value that is not a table, carries any key other than `inventory`, or declares `inventory` as anything but a non-empty absolute path string.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/mcp-inventory.test.ts` — `rejects an mcp configuration table it cannot resolve to one absolute inventory path`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Machine-readable command inventory

### CLI-005 — Generated command contract

The repository MUST publish `man/ki.commands.json` with schema identity `ki/commands/v1`, complete public command paths, and descriptions reconciled against both manual sections and the registered command tree.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/manage/inventory.test.ts` — `keeps purpose-oriented manual and changelog inventories complete`.

_Evidence:_ The generated inventory is byte-checked against `man/ki.1`, and the named CLI contract test is part of the passing `bun run test:coverage` gate.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
