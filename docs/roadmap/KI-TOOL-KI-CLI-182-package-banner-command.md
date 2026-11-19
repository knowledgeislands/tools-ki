---
id: KI-TOOL-KI-CLI-182
area: CLI
title: Package banner command
kind: deliver
purpose: capability
priority: medium
size: m
assignee: work/ki.summit
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-19T03:25:00Z
updated_at: 2026-11-19T03:25:00Z
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

Capture only; nothing is built. In scope when planned: reading one package, `work/<territory>/<id>/` in the Cairn store, its `_index.md` state fields, Now, Held and Changes, and its change documents' Open sections; the roadmap line from the roadmap summary of the package's repository; rendering the banner and the art. Out of scope: the report heading, the Summary's status table and queries, striking the mark or writing anything to the package, releases of `tools-ki` (TOOL-RELEASES, parked), and teaching `ki work status` the Cairn store, which is a separate, parked change.

## Shaping

**Approach.** A new `ki work banner` subcommand beside `ki work status` and `ki work base`, with a package reader in `src/core/work/` and a renderer whose output the tests compare byte for byte with the standard's examples.

- `<package>` is a work id, such as `ki.summit`, resolved under the store's `work/<territory>/`; with none given, the package whose folder holds the working directory.
- `--full` (the default for a Summary or Status) prints the art, the banner heading, the counts line, the roadmap line, the package line, the items, the heading-for and listening lines where they stand, and the thread line. `--short` prints the Position's short banner: no art, roadmap or package lines. `--no-art` leaves the art out of a full banner, as `no art` does.
- Sources: the banner heading's state and `at` from `ki-state` and `ki-since`; the thread line from `ki-workers`, the seat's role glyph from `ki-work-package`'s role catalogue and the actor's name from the store's roster; the package line's changes, open queries, held items and meetings from the Changes list, the change documents' Open sections, Held and the store's meetings; the roadmap line from the roadmap summary of each repository in `ki-repositories`, or `🗺️ roadmap · none`.
- Live session state the package does not hold, the running, queued and blocked runs and their items, comes in from the caller, through options or a JSON document on standard input; the command never guesses it.

**Acceptance criteria.**

- [ ] For each state in the standard's table of states, the output matches the standard's finished banner examples exactly, glyphs, spacing and blank lines included, with zeros written in the counts line.
- [ ] `--short` omits the art, roadmap and package lines; `--no-art` omits only the art; a run-report banner carries no heading-for or listening line.
- [ ] The art is the 11-line, 88-column drawing below, unchanged but for the scroll's four lines, each centred in the 54 characters between its `|` marks, any odd space going on the right, and no scroll line longer than 54 characters.
- [ ] The roadmap line reads `🗺️ roadmap · <n> records · <n> open · <n> done awaiting prune · <n> ideas` from the roadmap summary, ideas counting `triage` records and done awaiting prune counting `done` and `cancelled` records, or `🗺️ roadmap · none` where a repository has no roadmap.
- [ ] The package line reads `📦 package · changes <n> · open <n> · held <n> · meetings <n>` with zeros written.
- [ ] The thread line is `<Name> (<role glyph> 🔑 <work-id>)` where the seat's actor is named in the roster, and the bare form otherwise; it is always the last line.
- [ ] A missing or unreadable field is reported as an error naming the file and field, never filled with a default.
- [ ] Tests cover each state, `--short`, `--no-art`, an unnamed seat and a package with no roadmap; the repository's checks pass.

**Dependencies.** The roadmap summary prints only a table today, with no JSON output and none of the four banner counts directly; planning either adds a JSON form to `ki repo roadmap summary` or has the command count records itself through the shared roadmap reader. The store's path comes from the rig's configuration, the Cairn MCP's `MCP_CAIRN_STORE`.

**Decisions needed.** Whether the art's scroll carries the host, state, counts and time, as the design note and Kitteth's rules have it, or only KNOWLEDGE ISLANDS, as the standard's part F1 reads; that is ki.cairn's under FOOTER-AGORA. Whether the command takes the live counts and items as options or as JSON on standard input.

**Promotion.** To Next once the scroll question is settled and the roadmap counts' source is chosen; it is built on `main` under LAND-THEN-REVIEW and goes out in no release until TOOL-RELEASES is settled.

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
