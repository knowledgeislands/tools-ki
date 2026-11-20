---
id: KI-TOOL-KI-CLI-182
area: CLI
title: Package banner command
kind: deliver
purpose: capability
priority: medium
size: m
assignee: work/ki.summit
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: a121c07cfdc9b9dab3fb59f62497815b46bbd100
created_at: 2026-11-19T03:25:00Z
updated_at: 2026-11-20T12:40:00Z
---

# KI-TOOL-KI-CLI-182: Package banner command

## Goal

`ki work banner [<package>] [--full|--short] [--no-art]` prints a work package's closing banner exactly as the `ki-coordination` standard lays it out, read from the package in the Cairn store, so that every agent host renders the same footer and nobody counts spaces by hand.

## Context

Kitteth, the Cairn summit's governor, asked on 19 November 2026 for "a `ki` command that prints a package's banner, from its `_index.md` and change documents, with the art scroll included". Kris's words, recorded as KI-SURFACE in cairn.summit's Learnings, were that "the whole sort of KI command surface definitely needs a close look"; ki.summit holds the `ki` command surface until Ferris, ki.tools' actor, is seated, and this is its first change.

Today every coordinator assembles the banner by hand: the state heading, the five-view counts line, the roadmap and package lines, the items list, the listening line and the thread line, with the Knowledge Islands art above them in a Full reply. Hand-built banners drift in spacing, counts and glyphs, and the art's 88-column scroll is the part most often misdrawn.

The layout is normative in the backpack's `ki-coordination` skill: `references/standard-coordination.md` section 4.6 Banner (the table of states and glyphs) and `references/standard-report-forms.md` sections 4.1.5 Templates (parts F1 to F9) and 4.2 Banner detail; `scripts/banner.test.ts` there checks the standard and the output style agree. What the art and footer lines carry is ki.cairn's under FOOTER-AGORA; until Cairn publishes its own, the art is the one in the summary-model design note, set out under Discussion below.

`ki work status` cannot serve as the reader: it reads only the retired in-repository shape, `+/_WORK/<id>/` with `state.md` and `messages.md`, and reports no work in the Cairn store.

## Boundary

In scope: reading one package, `work/<territory>/<id>/` in the Cairn store, its `_index.md` state fields, Now, Held and Changes, and its change documents' Open sections; the roadmap line from the roadmap summary of the package's repository; rendering the banner and the art, with the live counts, items, heading-for line and meetings the caller passes in. Out of scope: the report heading, the Summary's status table and queries, striking the mark or writing anything to the package, releases of `tools-ki` (TOOL-RELEASES, parked), and teaching `ki work status` the Cairn store, which is a separate, parked change.

## Shaping

**Approach.** A new `ki work banner` subcommand beside `ki work status` and `ki work base`, with a package reader in `src/core/work/` and a renderer whose output the tests compare byte for byte with the standard's examples.

- `<package>` is a work id, such as `ki.summit`, resolved under the store's `work/<territory>/`; with none given, the package whose folder holds the working directory.
- `--full` (the default for a Summary or Status) prints the art, the banner heading, the counts line, the roadmap line, the package line, the items, the heading-for and listening lines where they stand, and the thread line. `--short` prints the Position's short banner: no art, roadmap or package lines. `--no-art` leaves the art out of a full banner, as `no art` does.
- Sources: the banner heading's state and `at` from `ki-state` and `ki-since`; the thread line from `ki-workers`, the seat's role glyph from `ki-work-package`'s role catalogue and the actor's name from the store's roster; the package line's changes, open queries, held items and meetings from the Changes list, the change documents' Open sections, Held and the store's meetings; the roadmap line from the roadmap summary of each repository in `ki-repositories`, or `🗺️ roadmap · none`.
- Live session state the package does not hold, the running, queued and blocked runs and their items, comes in from the caller, through options or a JSON document on standard input; the command never guesses it.

**Acceptance criteria.**

- [x] For each state in the standard's table of states, the output matches the standard's finished banner examples exactly, glyphs, spacing and blank lines included, with zeros written in the counts line.
- [x] `--short` omits the art, roadmap and package lines; `--no-art` omits only the art; a run-report banner carries no heading-for or listening line.
- [x] The art is the 11-line, 88-column drawing below, unchanged but for the scroll's four lines, each centred in the 54 characters between its `|` marks, any odd space going on the right, and no scroll line longer than 54 characters.
- [x] The roadmap line reads `🗺️ roadmap · <n> records · <n> open · <n> done awaiting prune · <n> ideas` from the roadmap summary, ideas counting `triage` records and done awaiting prune counting `done` and `cancelled` records, or `🗺️ roadmap · none` where a repository has no roadmap.
- [x] The package line reads `📦 package · changes <n> · open <n> · held <n> · meetings <n>` with zeros written.
- [x] The thread line is `<Name> (<role glyph> 🔑 <work-id>)` where the seat's actor is named in the roster, and the bare form otherwise; it is always the last line.
- [x] A missing or unreadable field is reported as an error naming the file and field, never filled with a default.
- [x] Tests cover each state, `--short`, `--no-art`, an unnamed seat and a package with no roadmap; the repository's checks pass.

**Dependencies.** The roadmap summary prints only a table today, with no JSON output and none of the four banner counts directly; planning either adds a JSON form to `ki repo roadmap summary` or has the command count records itself through the shared roadmap reader. The store's path comes from the rig's configuration, the Cairn MCP's `MCP_CAIRN_STORE`.

**Decisions needed.** Whether the art's scroll carries the host, state, counts and time, as the design note and Kitteth's rules have it, or only KNOWLEDGE ISLANDS, as the standard's part F1 reads; that is ki.cairn's under FOOTER-AGORA. Whether the command takes the live counts and items as options or as JSON on standard input.

**Promotion.** To Next once the scroll question is settled and the roadmap counts' source is chosen; it is built on `main` under LAND-THEN-REVIEW and goes out in no release until TOOL-RELEASES is settled.

## Current state

Planned to Ready on 19 November 2026 by the ki.summit build run, on Loreward's brief from [14, step 2](https://github.com/krisb/ki-cairn-store/blob/main/work/ki/ki.summit/14-ki-command-surface.change.md#5-steps), under LAND-THEN-REVIEW: built on `main` without waiting for Kris, reviewed afterwards, and released in nothing until TOOL-RELEASES is settled. Both decisions the Shaping section names are taken, by Loreward on 19 November in [14, 4.1](https://github.com/krisb/ki-cairn-store/blob/main/work/ki/ki.summit/14-ki-command-surface.change.md#41-the-banner-command), within the package's remit and reversible:

- **Live counts:** `--running`, `--queued` and `--blocked`, each defaulting to 0; everything else is read from the package. A `--json` input can follow when a second harness needs it.
- **The scroll:** as Kris drew it, with Kitteth's four rules: the host and state in capitals; a blank line; the counts in words; the day, date and local time; each centred in the 54-character space, any odd space on the right. The standard's F1 wording stays ki.cairn's under FOOTER-AGORA, and the template is one file to change if ki.cairn rules otherwise.

The roadmap counts' source is the shared roadmap reader: the command counts each package repository's records itself, so `ki repo roadmap summary` gains no JSON form here. That settles the promotion condition, and the record moves to Next and Ready together.

Implemented on 19 November 2026 by the same run, from baseline `a121c07c`, and awaiting review: see Review.

**Meeting line, 20 November 2026.** Under FOOTER-DELEGATES (Kris, 19 November 2026) the standard's F8 became the meeting line, `🤝 in <meeting> · with <names>`, replacing `👂 in <meeting>`, and the build still printed the older form. A steer run from Loreward's brief changed it while the record awaits review: each `--meeting <id>` is now found in the store's `meetings/` by the id its `ki-id` carries after `meeting:`, an unknown one is an error, and the line names each meeting with the other participants under its `ki-participants`, by their roster `ki-name` or a seat's id where one has none, leaving out the seat's own actor; with no other participant the `· with` part is left off, and two or more meetings are joined by `, `, each with its own list, as in `🤝 in other.room · with Quire, ex.tools@reviewer, ex.summit.call`. The owner is never listed in `ki-participants`, so is never named.

**Questions as headings, 20 November 2026.** Under QUESTIONS-FORM a (Kris, 19 November 2026) a change document asks each open question as a tagged heading, `#### TAG: title`, with Context, Query and lettered Options and then the weights line, and the numbered-item reader matched none of ki.summit's converted questions, so its banner showed 0 with you and 0 parked against a true 7 and 2. The same steer run taught the reader the heading form, as the Wayfinder reads it: each `####` heading under Questions is one question, its tag the heading's `TAG:` or the older `TAG -`, answered when a line under it leads with `**Done`, `**Taken`, `**Answered`, `**Agreed` or `**Settled`, and parked when its heading says `(parked)`. A document with no question headings is still read in the numbered form until every package converts. The weights line, `Benefit · Cascade · Confidence · Waits on`, carries no raised time or state, so a query's time stays its change document's `ki-revised`; anything finer is left for ACCEPT-BANNER's follow-up.

**Store and host.** STORE-SETTING, how `ki` finds the store, stays held for Kris under PARK-11-12 a, so the command adds no setting of its own. It reads `--store`, then the Cairn MCP's `MCP_CAIRN_STORE`, then `[store] path` in `$XDG_CONFIG_HOME/cairn/config.toml`, the rig's Cairn configuration chezmoi renders; with no package named, the package and store come from the working directory. The scroll's host is `--host`, or that file's `[rig] name`.

**Reading rules.** Where the standard leaves a count's source open, the command reads:

- **Open queries:** the questions of each change document's Questions subsection, `### <n>.1 Questions` under `## <n>. Open`, its sub-packages' included; an item whose bold lead begins `Done` is answered, and one whose first line says `(parked)` is parked. On hold, every unanswered query counts as parked.
- **With you:** the open queries that are not parked, each a `👤 <tag> · owner · at <time>` item, its tag the item's `TAG:` lead or first `(TAG)`, its time the change document's `ki-revised`, oldest first.
- **Held:** the top-level items under `_index.md`'s `## Held`.
- **Meetings:** the open meetings, `ki-status: open`, under the store's `meetings/` that sit at the package or count one of its `ki-workers` actors among their participants.
- **The scroll's state:** `ON HOLD`, `SNOOZING`, `FINISHED`, or else `WITH YOU` when anything waits on Kris (a query with him, or the work with the supervisor or handed to him) and `ALL CLEAR` otherwise, as Kitteth's first rule has it.

## Steps

- [x] Read one package from the store in `src/core/work/package.ts`: resolve the store and the package, from an id, a `+` sub-package id or the working directory; read the state fields, the hold, target and blocking fields, the seat's role and actor, the roster's `ki-name` and the role's `ki-glyph`, Held, the change documents' Open sections, the meetings, and each `ki-repositories` repository's roadmap counts through the registry and the shared roadmap reader. A missing or malformed field is an error naming the file and field.
- [x] Move the art into `src/assets/banner-art.txt`, the 11-line, 88-column drawing with an empty scroll, and render it in `src/commands/work/banner.ts`: the four scroll lines centred, the extra space on the right, no line over 54 characters.
- [x] Render the banner from the one table of states: each state's heading, the counts line with zeros written or the hold line, the roadmap and package lines in a Full banner, the items in the standard's order, the heading-for and listening lines where they stand, and the thread line last, named first where the roster names the seat's actor.
- [x] Add `ki work banner [package] [--store <dir>] [--full|--short] [--no-art] [--running <n>] [--queued <n>] [--blocked <n>] [--item <line>]... [--heading-for <line>] [--meeting <id>]... [--host <name>]` beside `ki work status`, with the local time zone from `TZ` and the clock from the context.
- [x] Add CLI contract tests in `src/tests/cli/work/banner.test.ts` through the sandbox: each state's heading, the counts line with zeros written, Full against Medium and Short lines, `--no-art`, the scroll's centring with odd splits, the thread line named from the roster and bare where unnamed, a package with no roadmap, and each error.
- [x] Document it in the README, the manual and its command inventory, and the changelog; make `src/assets/assets.d.ts` describe the text assets it now serves.
- [x] Run the full gate.

## Files touched

`src/core/work/package.ts`, `src/core/paths.ts`, `src/commands/work/banner.ts`, `src/commands/work/index.ts`, `src/assets/banner-art.txt`, `src/assets/assets.d.ts`, `src/tests/cli/work/banner.test.ts`, `src/tests/cli/manage/inventory.test.ts`, `vitest.config.ts`, `README.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md` and this record. Not touched: the backpack, the Cairn store, `ki work status`, `ki repo roadmap summary`, `.ki.toml`, any release file or version.

## Verify

`bun run test:coverage` at the 100% thresholds, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run ki:tools:lint-man`, `bun scripts/generate-command-inventory.ts` with no drift, and `ki repo audit --repo .` adding no failure to the known ones (records 178 and 179's titles, FILES-6, TOPICS-1). Then `ki work banner ki.summit --full --running 0`, run against the real store, matches the standard's layout by eye, and its scroll lines measure 54 characters between their marks.

## Dependencies / blocks

None to build. Going out waits on TOOL-RELEASES, parked with Kris; until then, the primary checkout's `ki` on sol runs it from `main`.

## Documentation impact

### Decision Records

None. The two decisions are Loreward's, recorded in 14, 4.1.

### Specifications

None; the layout's normative source is the backpack's `ki-coordination` standard.

### Guides

The README's work-model section and the manual gain `ki work banner`.

### Roadmap

This record only.

## Review

### Delivered

The Goal is met. `ki work banner [<package>]` prints a package's closing banner from the Cairn store: the art with Kris's scroll, the state's heading, the counts or hold line, the roadmap and package lines in a Full banner, the items in the standard's order, the heading-for and listening lines where the caller passes them, and the thread line last, named from the roster. Run against the real store, `ki work banner ki.summit --full --running 0` prints `SOL  ·  WITH YOU`, `5 waiting on you  ·  nothing running` and the local date and time on the scroll, the With worker heading, `🗺️ roadmap · 4 records · 2 open · 0 done awaiting prune · 2 ideas`, `📦 package · changes 5 · open 5 · held 2 · meetings 0`, the five queries with Kris oldest first and `Loreward (🏛️ 🔑 ki.summit)`.

### Change Summary

- `src/core/work/package.ts` reads one package: the store from `--store`, `MCP_CAIRN_STORE` or the rig's `cairn/config.toml`; the package from its id, a `+` sub-package id or the working directory; its state, hold, target and blocking fields, Held, the change documents' open queries, its open meetings, the seat's role glyph and actor name from the roster, and each repository's roadmap counts through the registry and the shared roadmap reader. Every missing or malformed field is an error naming the file and field.
- `src/assets/banner-art.txt` holds Kris's drawing with an empty scroll; `src/commands/work/banner.ts` fills the scroll and renders the banner from the one table of states.
- `src/commands/work/index.ts` adds the subcommand and its options; `src/core/paths.ts` adds `xdgConfigHome`.
- `vitest.config.ts` gains a small loader so the tests read a `.txt` asset as its text, as Bun does with `with { type: 'text' }`.
- The README, manual, command inventory and changelog document the command.

### Verification

`bun run test:coverage`: 86 files, 1,397 tests, 100% statements, branches, functions and lines, 38 of them in `src/tests/cli/work/banner.test.ts`, covering every state's heading, the counts line with zeros written, Full against `--short`, `--no-art`, Kris's drawing reproduced byte for byte with its odd split, even splits, the thread line named, bare and `🧵`, a package with no roadmap, the item order with live items, and each error. `bunx tsc --noEmit`, `bunx biome check`, `bun run ki:tools:lint-man`, rumdl and the command inventory pass; knip reports only the unused export that also stands on `main`. `ki repo audit --repo .` reports the same failures as `main` and nothing new: KNIP-2 and DEPS-1, FILES-6, TOPICS-1, and the titles of CLI-178 and CLI-179.

### Outstanding concerns

- The reading rules are heuristics over prose the standard does not yet fix: a query is answered when its bold lead begins `Done`, parked when its first line says `(parked)`, and its time is its change document's `ki-revised`, not the query's own. A field the store adds for these would replace them.
- The store's location reads the Cairn MCP's setting and the rig's Cairn configuration until STORE-SETTING is settled.
- The scroll follows Kris's drawing and Kitteth's rules; the standard's F1 still reads KNOWLEDGE ISLANDS alone until ki.cairn settles FOOTER-AGORA.
- A Project's `📥 <n> to accept` count is not read; the caller can pass it as an item.
- A worker's `status` defaults to active and a package's label to its id where the fields are absent, as the work-package standard has them.
- Nothing is released: TOOL-RELEASES is parked with Kris, and the primary checkout's `ki` on sol runs it from `main`.

### Post-change review

The command only reads. Its one wider change is the Vitest text loader, which affects only `.txt` imports, and none other exists. Live counts it cannot see come from the caller, so a coordinator still has to pass `--running`, `--queued` and `--blocked`.

### Mini recap

`ki work banner` prints any package's banner from the store, art and scroll included, exactly as the standard lays it out, with the live counts as options.

## Discussion

### The art

The art's canonical source is the summary-model design note that Kris approved under SUMMARY-MODEL on 4 November 2026, `+/_WORK/personal.reg.household-terra/_emerging/summary-model.design.md` in `krisb/dotfiles` at commit `29dc51c`; the note was removed from the working tree in commit `962e0af6` and survives only in that repository's history. No Markdown file on the rig holds it. The copy below is that drawing verbatim, so the build can take it from here into a template asset under `src/` and the record no longer has to carry it.

```text
  /==================================================================================\
 /                                 KNOWLEDGE  ISLANDS                                 \
|======================================================================================|
  _[===]_       ________________________________________________________       _[===]_
   |:|:|       (_)----------------------------------------------------(_)       |:|:|
   |:|:|        |                  TERRA  ·  ON HOLD                   |        |:|:|
   |:|:|        |                                                      |        |:|:|
   |:|:|        |         2 waiting on you  ·  nothing running         |        |:|:|
   |:|:|        |       Wednesday 4 November 2026  ·  01:00 GMT        |        |:|:|
   |:|:|       (_)----------------------------------------------------(_)       |:|:|
  _|___|________________________________________________________________________|___|_
```

Kris's shape notes and Kitteth's rules for it:

- Drawn by Kris: 11 lines, 88 columns, every line symmetric. The title's double space centres `KNOWLEDGE  ISLANDS` exactly, with 33 spaces each side.
- Only the scroll's four lines change. Each is centred in the 54-character space between its two `|` marks:
  1. the host and the state in capitals, such as `SOL  ·  WITH YOU`, or `<HOST>  ·  ALL CLEAR` when nothing waits on Kris;
  2. a blank line;
  3. the counts in words, such as `2 waiting on you  ·  1 running`, or `nothing waiting on you  ·  nothing running`;
  4. the day, date and local time, such as `Wednesday 4 November 2026  ·  01:00 GMT`.
- Where the space cannot split evenly, the extra space goes on the right.

### Where it sits

`ki work` is the work model's reader, so the banner belongs beside `ki work status`. A later `ki work summary` could add the heading block and status table around it; that is not this record.
