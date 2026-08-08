---
id: KI-TOOL-CLI-025
title: Restructure repository configuration contract
theme: cli
horizon: now
status: draft
blocks: [KI-TOOL-VENDOR-001]
blocked-by: []
baseline-ref: null
---

## Goal

Make a repository's `.ki-config.toml` say each thing once: declare its harnesses in one list, name each governing skill by its bare name under a single `[skills]` namespace, and name each trade partner once with the kinds it trades. A reader should be able to see at a glance which skills govern the repository and what its relationship with each peer is, without reassembling either from a repeated prefix or from four separate lists.

## Context

The current contract requires every skill to be declared as a fully-qualified `<harness-id>:<skill-name>` quoted TOML table. In this repository the prefix `knowledgeislands/ki-agentic-harness:` repeats sixteen times, roughly a third of the file being one repeated string; the Harness's own configuration repeats it more often still. Nesting compounds the cost, because `["knowledgeislands/ki-agentic-harness:ki-roadmap".themes]` spends fifty-six characters to name a table of roadmap themes, in the quoted-key and dotted-key combination that is the least familiar corner of TOML syntax. The qualified identity contains both a colon and a slash, neither of which TOML permits in a bare key, so the declaration must be quoted even though the specification advises bare keys except where quoting is necessary.

`TRD-aacc8a12` records the shape argument and was sent to the Harness, which owns the portable contract. This item is the host half: whatever key names and nesting the Harness settles, `ki` is the consumer that parses the file, resolves declared skills to providers, reports capability status, and reconstructs a qualified identity when declaring or undeclaring a skill.

The format also conflates declaring a skill with configuring it. An intentionally empty table cannot be told apart from an abandoned stub, and there is no structural distinction between a skill table and a repository-level setting belonging to no skill. `ki` resolves that ambiguity by treating any top-level key that begins `ki-` or contains a colon as a declaration — a consumer's reading of the file rather than a property of the format. One consequence is already live in this repository: `ki-trades` has no root table at all, only the two `.exports_to` and `.imports_from` sub-tables, so it is declared implicitly by a sub-table header. A `[skills]` namespace makes the distinction structural, and separating declaration from configuration fixes that defect rather than leaving it to a heuristic.

## Boundary

This item does not decide the contract. Key names, nesting, and estate migration sequencing belong to the Harness through `KI-HARNESS-GOV-021`; this item implements whatever that settles and migrates this repository's own file. It does not change what any skill's configuration means, does not change trade route semantics or route state computation, and does not touch the `-` and `+` working areas.

**No compatibility path.** The old fully-qualified top-level format is not read after the cutover. There is no dual parse, no fallback, and no transition period. An unmigrated file must fail loudly with a diagnostic that names the expected shape.

## Current state

`readDeclaredSkills` in `src/core/configuration.ts` walks the parsed document's top-level entries and applies `looksLikeSkill`, which returns true for any key starting `ki-` or containing a colon; anything matching must then satisfy `qualifiedSkill`, which splits on a single colon and validates harness and skill name against separate expressions. A duplicate-name check already rejects the same skill name declared by two providers, so the existing contract already guarantees a skill name is unique per repository regardless of provider — which is precisely what makes bare-name resolution safe.

`declareRepositorySkill` and `undeclareRepositorySkill` in the same module manipulate the file as text rather than re-serialising it, matching on the literal `["<identity>"]` header and on the `["<identity>".` prefix for nested tables, so both are coupled to the quoted-qualified spelling. `REPOSITORY_SKILL_IDENTITY` hard-codes `knowledgeislands/ki-agentic-harness:ki-repo`, and `renderRepositoryConfiguration` emits that quoted header for `ki repo init`.

Consumers reach beyond parsing. `src/core/resolution.ts`, `src/core/planning.ts`, `src/agents/runtimes.ts`, `src/agents/skills.ts`, `src/commands/manage/doctor.ts`, `src/commands/repo/index.ts`, `src/commands/repo/upgrade.ts`, and `src/commands/repo/repository-health.ts` all consume `DeclaredSkill`, most of them through `identity`. `resolveInstalledSkill` already reports when a skill is provided by multiple installed harnesses, so the machinery for the ambiguity rule exists; what changes is that resolution must bind against the repository's declared harness list rather than whichever harnesses happen to be installed, so a version-controlled file means the same thing on every machine.

Trade routes are parsed separately by `parseConfiguration` in `src/core/trade-core.ts`, which reads `[<qualified ki-trades>].exports_to` and `.imports_from` as tables keyed by kind, each holding an array of canonical HTTPS repository URLs. `parseRoutes` hand-checks each array for uniqueness and lexical ordering, and `writeTradeConfiguration` rewrites the owned header span by matching headers against the quoted qualified table name. In this repository four distinct partners occupy nine URL entries spread across four lists.

## Steps

- [ ] Confirm the settled contract from `KI-HARNESS-GOV-021` before writing code — the key names (`[repo]`, its `harnesses` list, and `[skills.<name>]`), whether routes are keyed by partner, and whether a route entry is an inline table or a nested table header.
- [ ] Read the declared harness list from `[repo] harnesses` and make it the resolution basis: a bare skill name binds to exactly one declared provider, no declared harness providing the skill is a clear diagnostic, and more than one requires explicit qualification.
- [ ] Parse `[skills.<name>]` as the declaration, retaining support for a quoted `[skills."<harness>:<name>"]` key for the exceptional case of a skill drawn from a harness outside the declared list, so the exception stays visibly exceptional.
- [ ] Derive `DeclaredSkill.identity` from the bare name plus its resolved provider, so the cost of the change concentrates in identity derivation rather than spreading across the nine consuming modules.
- [ ] Delete `looksLikeSkill` and the top-level heuristic outright; a key is a declaration because it sits under `[skills]`, not because it looks like one.
- [ ] Rewrite `declareRepositorySkill` and `undeclareRepositorySkill` against the new header spelling, and update `REPOSITORY_SKILL_IDENTITY` and `renderRepositoryConfiguration` so `ki repo init` emits the new shape.
- [ ] Re-key trade routes by partner repository if the Harness adopts that shape, so each partner is named once carrying its kinds, replacing the hand-written uniqueness and lexical-ordering checks with TOML's own prohibition on defining a key twice, and dropping the explicit empty array a direction currently needs when it carries no kinds.
- [ ] Migrate this repository's `.ki-config.toml`, giving `ki-trades` an explicit `[skills.ki-trades]` declaration so it is no longer declared only by its sub-tables.
- [ ] Make an unmigrated file a loud, specific failure naming the expected shape, with no fallback parse.
- [ ] Update `man/ki.1`, `README.md`, and `CHANGELOG.md` for the changed contract.

## Files touched

- `src/core/configuration.ts` — parsing, declaration, undeclaration, and identity derivation.
- `src/core/resolution.ts` — provider binding against the declared harness list.
- `src/core/trade-core.ts` — route table parsing and rewriting.
- `src/agents/skills.ts`, `src/agents/runtimes.ts`, `src/core/planning.ts`, and the `src/commands/repo/` and `src/commands/manage/` consumers, as identity derivation shifts.
- `.ki-config.toml` — this repository's own migration.
- `src/tests/cli/repo/` and `src/tests/cli/trade/` — new-shape fixtures and rejection tests.
- `man/ki.1`, `README.md`, `CHANGELOG.md`.

## Verify

`bun run test`, `bunx tsc --noEmit`, and `ki repo audit` against this repository after its own file is migrated. Coverage remains at 100% over product code with no threshold change, which means the rejection path for an unmigrated file, the no-provider diagnostic, and the ambiguous-provider diagnostic each need a reachable CLI test rather than a guard comment.

Confirm `ki repo audit`, `ki skill repo`, `ki trade routes list`, and `ki repo doctor` all behave identically on the migrated file to how they behave on the current one, and that `ki repo init` emits a file the parser accepts.

Confirm that an unmigrated file fails with a diagnostic naming the expected shape, rather than silently reporting zero declared skills — a heuristic parser that finds nothing is the failure mode this contract change must not introduce.

## Dependencies / blocks

Blocks `KI-TOOL-VENDOR-001`, whose provenance contract needs the declared harness list as its anchor.

This item previously blocked `KI-TOOL-CLI-024` on the reasoning that the estate diagram reads route declarations and should be built once against the settled shape. That was withdrawn before `024` was implemented: the diagram consumes `inspectEstateRoutes`, which returns an inspection type rather than raw configuration, so a change to the declaration syntax lands in the parser and leaves the renderer untouched. `024` shipped against the current shape without incurring the rework the block was meant to prevent.

`KI-HARNESS-GOV-021` in `knowledgeislands/ki-agentic-harness` settles the portable contract this item implements, and `KI-HARNESS-GOV-022` covers the estate migration. Both are recorded here as prose rather than as `blocked-by` identifiers, because they are items in another repository which owns its own priority, plan, and execution. Work here should not begin until the contract is settled, but the Harness schedules that in its own horizon.

`TRD-aacc8a12` is the originating trade, sent from this repository to the Harness.

## Discussion

### Why the empty-table ambiguity matters

An empty `["knowledgeislands/ki-agentic-harness:ki-authoring"]` table means "this skill governs this repository and needs no configuration". It is indistinguishable from a stub someone started and abandoned, and from a typo. Under `[skills.ki-authoring]` the declaration is structural: the key's position states the intent, and its body is configuration or nothing. That the current file declares `ki-trades` only through its sub-tables is the live proof that the two concerns are conflated — nothing in the format required a root table, so none was written, and the heuristic covered for it.

### Why resolve against the declared list rather than the installed set

Resolving a bare name against whichever harnesses happen to be installed would make a version-controlled file mean different things on different machines. Resolving against `[repo] harnesses` keeps the file self-describing: the same commit resolves identically everywhere, and a missing provider is a diagnostic about the machine rather than a silent change in which skill governs the repository.

### Why no compatibility shim

An unmigrated file already fails loudly, because a bare table name is rejected today as unqualified. That makes a single clean cutover safe: there is no window in which both formats are plausibly correct, and no reader has to know which era a file belongs to. A dual parse would buy nothing and would preserve the heuristic this item exists to delete.

### Open question on route entry shape

An inline table suits a route that carries only its kinds, but the TOML specification intends an inline table to occupy a single line and strongly discourages breaking one across lines in favour of a standard table. A route that later gains a per-partner property would therefore have to convert to a nested table header whose key is the full URL. Whether to accept that later conversion or adopt the longer header immediately is the Harness's call, recorded here so the implementation does not quietly decide it.
