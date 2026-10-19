# Convert Obsidian links to GitHub Markdown

`ki markdown gfm` converts the Obsidian links in a batch of Markdown files to GitHub-flavoured Markdown (GFM), so the notes read correctly on GitHub and in any CommonMark renderer. It converts only what is mechanical. Everything that needs an owner's judgement is left exactly as it is and listed, and the batch is applied only once each listed item has been decided. Each batch runs as a cycle: preview it, decide what it lists, and apply it.

## What it converts

| Obsidian                                                 | GFM                                                    |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `[[observatory]]`                                        | `[observatory](Projects/observatory.md)`               |
| `[[Projects/observatory\|Observatory]]` in a table cell  | `[Observatory](Projects/observatory.md)`               |
| `![[Island Map (v2).png]]`                               | `![Island Map (v2).png](<../Diagrams/Island Map (v2).png>)` |
| `[the rig](Enactment%20Process.md#Some%20Heading)`       | `[the rig](<Enactment Process.md#Some%20Heading>)`     |

Destinations are relative to the note that holds the link. A destination holding a space or a parenthesis goes in angle brackets. `%`, `#`, `?` and angle brackets in a file name are percent-encoded, and any other escape in a `%20` link is kept. The link text is escaped so GitHub shows it literally.

Heading links, such as `[[Guide#Set up the Rig]]`, convert only when the batch's decisions file sets `heading_fragments = "github"`. The fragment is then the heading's GitHub slug, matched by its exact text first and then case-insensitively.

## How targets resolve

The candidates are every regular file under the vault root, except dot-entries such as `.git`, `.obsidian` and `.trash`, and `node_modules`. Symbolic links are not followed. The root is the nearest directory above the working directory that holds `.obsidian` or `.git`, unless `--root <dir>` names another.

A target without an extension is tried with `.md` first, then as written. Three steps are tried in order, and the first that finds anything decides:

1. **Beside the note:** a file at that path relative to the note's own folder.
2. **Full path:** a file at that path from the root.
3. **Leaf name:** any file whose path ends with the target.

The first two steps prefer the exact spelling, then accept a unique case-insensitive match. The third is case-insensitive only. When a step finds more than one file, the link is listed as ambiguous with its candidates, and no single one is chosen. A converted link always carries the file's spelling on disk, so `[[streams/themes/themes]]` becomes a link to `Themes/Themes.md`.

## What it lists

Each item is listed as `path:line: kind text`. Its bytes are left as they are.

| Kind                   | Meaning                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `ambiguous`            | More than one candidate at the deciding step                                         |
| `unresolved`           | No candidate, including a `%20` link to a missing file or a malformed escape         |
| `heading-link`         | A heading link, while the batch has not decided heading fragments                    |
| `missing-heading`      | A heading link whose heading the target does not have                                |
| `block-reference`      | A link to a `^block`                                                                 |
| `sized-embed`          | An image embed with a size, such as `![[map.png\|400]]`                              |
| `transclusion`         | An embed of a note, or of an image with a subpath                                    |
| `front-matter-link`    | A link inside front matter                                                           |
| `comment-link`         | A link inside a `%%` or HTML comment, including an unclosed one                      |
| `template-destination` | A link inside a `{{ }}` or `<% %>` template expression, or with one in its target    |
| `callout`              | A callout GitHub does not render: a custom type, or any type with a fold marker      |
| `dataview`             | A Dataview fence or inline query                                                     |
| `protected`            | A whole file under `_Voice Notes`, or under a protected path the decisions file names |
| `generated`            | A whole file that opens with a `<!-- generated` comment                              |
| `encoding`             | A whole file that is not valid UTF-8                                                 |

Links inside fenced or inline code are examples, so they are neither converted nor listed. Neither is an escaped `\[[`.

## Preview, decide and apply

Run a dry run over the batch's explicit paths. A directory contributes the Markdown files under it.

```sh
ki markdown gfm --dry-run --preview /tmp/streams.preview.json Streams
```

The dry run prints a zero-context diff for each changed file, then the item list, then a summary line, and it writes the preview. Review the diff, then decide each listed item in a TOML decisions file:

```toml
heading_fragments = "github"
protected = ["Streams/Archive"]

[[item]]
path = "Streams/Projects/Projects.md"
text = "[[Themes]]"
action = "convert"
target = "Streams/Themes/Themes.md"

[[item]]
path = "Streams/Streams.md"
text = "[[{{project}}]]"
action = "keep"
```

An item is matched by its file and its exact text, as listed:

- `keep` leaves that text as it is.
- `convert` resolves an ambiguous or unresolved link to the named target, which must exist under the root in its exact case. A `convert` decision for any other kind of item is ignored, and the item stays undecided.

The command refuses a key it does not define. Run the dry run again with `--decisions` and review the new preview. When the summary shows no undecided items, apply with the same paths and decisions:

```sh
ki markdown gfm --decisions streams.toml --preview /tmp/streams.preview.json --manifest /tmp/streams.manifest.json Streams
```

The apply plans the batch again and writes nothing at all if the root, the decisions file, the set of files or any file's bytes or conversion differs from the preview, or if any item is still undecided. It then creates the manifest, which must be a new file, and only then rewrites the changed files.

## Roll back

The `ki/markdown-gfm-manifest/v1` manifest records, for each changed file, its root-relative `path`, the SHA-256 digests of its contents `before` and `after`, and its `preimage`. To reverse a batch, check that each file's current digest is still `after`, then write its `preimage` back. Commit a batch by explicit path, so that a rollback is one commit too.

## Guarantees

- Every byte outside a converted link is copied unchanged, and each converted link is parsed back and checked against the file it should point to before the plan is accepted.
- The command never formats or reflows a file. Run any formatter as its own step.
- A converted batch converts to itself: a second dry run reports no changes.
- Only the named paths are read for conversion and only changed files among them are written. The rest of the vault is read only to resolve targets and headings.
