# Local utility commands

`ki search`, `ki cleanup`, and `ki docs` operate only on local KI state or fixed public documentation locations.

They do not discover a repository, fetch content, contact a registry, launch a browser, or activate a skill.

## Search installed capabilities

Run `ki search <query>` with one non-empty query.

KI inspects only verified installed harnesses and matches the query case-insensitively against each harness identifier, capability kind, and capability name.

It prints matching capabilities in harness identifier, capability kind, and capability name order.

For example, `ki search bootstrap` can report the installed `ki-bootstrap` skill.

When no capability matches, the command succeeds and prints `No matching installed capabilities.`

## Report managed stale state

Run `ki cleanup` to report stale state that KI has explicitly recorded in a persisted, versioned KI-owned format.

V1 defines no such artifact format, so the command prints `No eligible managed stale state.` and does not change files.

It never treats cache contents, transaction-looking directories, unconfigured harnesses, links, or unknown files as stale merely from their names or locations.

## Print documentation locations

Run `ki docs [topic]` to print canonical public URLs.

With no topic, KI prints every location with an `Overview:`, `Site:`, `Manual:`, or `Roadmap:` prefix.

The supported single-location topics are `overview`, `site`, `manual`, and `roadmap`.

- `ki docs overview` prints `https://knowledgeislands.info/tooling/cli/`.
- `ki docs site` prints `https://knowledgeislands.info/`.
- `ki docs manual` prints `https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1`.
- `ki docs roadmap` prints `https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md`.

`ki docs` only prints the URL; it does not launch a browser or retrieve its content.
