# Tools-ki product-engineering standard

This standard records the repository-specific engineering goals that make `tools-ki` a trustworthy runtime-neutral command host. Portable TypeScript, authoring, repository, Git, trade, and release rules remain owned by their declared Harness skills; this file states how those standards meet the product.

## Architecture goals

- **One public host.** `tools-ki` owns command dispatch, validation, repository selection, transactions, installation, projections, and rendering for the public `ki` executable. Harnesses own reusable skill semantics, while KI Specifications owns portable normative contracts.
- **Action and domain separation.** Command modules own grammar, common option validation, selection, and output. Core modules own typed domain behaviour and repository effects. Presentation helpers do not become hidden domain coordinators, and core modules do not import command implementations.
- **Cohesive domains.** A module has one domain concern and one intelligible reason to change. Split unrelated lifecycle stages or provider concerns behind a domain barrel when they begin to evolve independently; do not split a coherent flow to satisfy a file-length target.
- **Injected capabilities.** Streams, filesystem roots, time, signals, and network access enter through `KiContext` or an explicit domain port. Deep defaults must not make supported failure paths impossible to exercise.
- **Current contract only.** Retired command grammars, wrappers, configuration spellings, and compatibility branches are removed after an authorised cutover unless a bounded transition is explicitly required.

## Test and coverage goals

- **Test the executable contract.** Product tests invoke `run(args, context)` through `src/tests/cli/_cli_helper.ts`, assert exit status, output, and on-disk effects in the sandbox HOME/XDG quartet. Internal unit tests are reserved for independently published pure contracts; they must not freeze ordinary implementation structure.
- **No live network.** The sandbox fetcher fails unless a test supplies an explicit provider fixture. Harness acquisition uses local fixture archives, and provider adapters use injected ports.
- **Coverage detects dead code.** `bun run test:coverage` is the engineering gate and retains 100% thresholds over product code. A reachable branch gains CLI evidence; an unsupported unreachable branch is removed.
- **Exclusions carry proof.** A `/* v8 ignore */` guard is acceptable only when its comment explains why no supported CLI input can reach it. A justification based on an upstream guarantee must hold for every caller, and a new caller requires the exclusion to be reconsidered. Interface-level fault injection is the last resort for a documented failure that one in-process CLI invocation cannot produce.
- **Fixture migrations identify their schema.** A mechanical rewrite of inline fixtures uses a scope predicate tied to the call site or destination file, not a regex that merely resembles both repository and user configuration. Review the diff for the other schema before running the suite.

## Portable contract goals

- **Verify external claims at their owner.** A statement about TOML, Markdown, Git, a provider, or another portable format is checked against its normative specification rather than inferred from one permissive or strict implementation.
- **Compare meaning across formatting boundaries.** Cross-repository Markdown records compare parsed fields and normalized prose when formatting is not semantically owned. Byte identity is used only for artifacts whose contract explicitly requires it.
- **Preserve authority boundaries.** Read-only provider acquisition does not authorise provider mutation, repository acquisition does not authorise source retirement, and local success does not confer authority over a sibling repository.

## Release goal

A release candidate follows `ki-repo-tools` release readiness and the repository's release guide. It is not ready merely because local tests pass: the candidate build, help, completions, manual, installer, version markers, packaging matrix, immutable publication, and clean-install proof must agree. Coverage remains a pre-publication engineering gate; publication evidence remains a release gate.

Before V1, `CHANGELOG.md` deliberately keeps `## [1.0.0] — in progress` as the accumulating V1 contract while `package.json` and Git tags identify shipped `0.x` releases. Do not align those markers by claiming V1 early or discarding the V1 baseline; the mismatch resolves only when V1 is actually released.

## Knowledge routing

Keep a rule here only while it is specific to `tools-ki`. Promote recurring fixture-migration, coverage, executable-contract, or cross-boundary comparison principles into their portable owning Harness skills once at least one other repository needs the same rule. Replace the local copy with a concise pointer after promotion.
