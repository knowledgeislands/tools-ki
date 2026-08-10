# Changelog

All notable changes to this project are documented here.

This changelog records the V1 release baseline. It does not retroactively track individual 0.x releases; their tags and commit history remain the record of that run-up.

## [1.0.0] — in progress

Pre-V1 work is summarized as this baseline; separate 0.x release entries are not maintained.

### Shipped commands

#### General

- `ki`
- `ki --help`
- `ki --version`

#### Installation

- `ki bootstrap`

#### Local management

- `ki manage completion <shell>`
- `ki manage outdated`
- `ki manage missing`
- `ki manage update`
- `ki manage cleanup`
- `ki manage diag`
- `ki manage doctor`
- `ki manage repair`
- `ki manage docs`
- `ki manage list`
- `ki manage search`

#### User management

- `ki skill add`
- `ki skill remove`

#### Agora management

- `ki agora list`
- `ki agora show <agora>`
- `ki agora roots <agora> [--null]`
- `ki agora open <agora> --target zed`

#### Repository options

- `ki repo --repo <path-or-pattern>`
- `ki repo --agora <name>`

#### Repository management

- `ki repo init`
- `ki repo open --target <zed|vscode> [--stores|--no-stores]`
- `ki repo audit`
- `ki repo conform`
- `ki repo diag`
- `ki repo roadmap list`
- `ki repo roadmap prune [id]`
- `ki repo roadmap promote <id> [horizon]`
- `ki repo roadmap demote <id> [horizon]`
- `ki repo educate`
- `ki repo repair`
- `ki repo skill add`
- `ki repo skill remove`
- `ki repo upgrade`

#### Registry management

- `ki registry add`
- `ki registry list`
- `ki registry` now keeps canonical GitHub identity and checkout bindings as keyed records in the machine-local `$XDG_STATE_HOME/ki/registry.toml`; `ki bootstrap --refresh` migrates and removes the retired configuration path list, which resolution no longer reads.

#### Harness management

- `ki harness info`
- `ki harness list`
- `ki harness install`
- `ki harness reinstall`
- `ki harness uninstall`

#### Trades

- `ki trade routes add`
- `ki trade routes remove`
- `ki trade routes list [--estate] [--incomplete] [--table|--html]`
- `ki trade routes check`
- `ki trade prepare`
- `ki trade observe`
- `ki trade submit`
- `ki trade abandon`
- `ki trade receive`
- `ki trade list`
- `ki trade show`
- `ki trade release`
- `ki trade prune`

#### Acquisition

- `ki acquire chatgpt import`

#### Development

- `ki dev local set <local-harness-path>`
- `ki dev local on`
- `ki dev local off`
- `ki dev skill rubric`

### Behaviours

- `ki manage completion <shell>` emits Bash and Zsh scripts derived from the registered command tree, including nested commands, options, closed values, and local path completion.
- Registered repository declarations define reciprocal named Agoras; the reserved `estate` selector derives the full locally registered canonical repository set for selection and Zed opening.
- `ki agora roots <agora>` exposes a stable machine interface for resolved registered Agora roots: newline-delimited by default, or NUL-delimited with `--null` (`-0`).
- `ki repo conform` stages safe writes until every initial audit passes, labels proposed and applied writes separately, and leaves proposed conform writes unapplied when an initial audit blocks publication.
- `ki repo roadmap list` is a framed horizon- and lifecycle-grouped text inventory with per-repository import and export trade context.
- `ki repo init`, local `ki registry add`, `ki repo repair`, and `ki repo conform` record selected canonical KI repository identities in the machine-local registry without treating registration as a repair or conformance verdict; `ki repo conform` records before evaluating findings.
- `ki trade routes list [--estate] [--incomplete]` is a framed local route inventory or a paired registered-estate table. Estate rows are lexical repository pairs with left-to-right and right-to-left sub-rows, explicit missing directions, and a stacked form on narrow terminals; `--table` explicitly selects that default estate text renderer. `--html` renders the estate as a self-contained interactive force-directed network instead, written to the cache and opened in a browser, drawing one arc per direction with accessible locally vendored Lucide Hammer and Book Open chips so a reciprocated pair separates. `--table` and `--html` both require `--estate` and cannot be combined; the viewer has no icon-font or network dependency.
- Trade kinds, observations, report statuses, diagnostics, and repository entities use a bounded named presentation registry. Layout punctuation remains local to each renderer, while terminal knowledge consistently renders as `ⓘ` and HTML uses the matching accessible Lucide Book Open mark.
- `ki trade prepare` creates a mutable local export once this repository declares the route; the receiver may observe it before `ki trade submit` freezes it, and `ki trade abandon --yes` removes it while it remains mutable. Receiver activation remains reciprocal.
- Trade pairing compares the payload the sender authored — its field values as parsed and its prose — rather than raw bytes, so a receiver that formats its own Markdown does not read as having tampered with a record.
- `ki trade list` is a framed registered-estate inventory of preparations, outbound submissions, and received imports, including their observation and cleanup state.
- `ki repo audit` and `ki repo conform` report the span in which a skill gathers its evidence, which precedes every criterion and on a subprocess-backed rubric is nearly the whole operation. The host names that span itself, so a session that emits nothing is still reported as gathering evidence rather than as a stalled item count; a session that takes the optional emitter refines it with its own named stages and steps, and a step carrying its own counters draws a determinate bar.
- `.ki-config.toml` names each harness once in `[repo]` and declares each governing skill by its bare name under `[skills]`, resolving that name against the declared harness list rather than against whichever harnesses happen to be installed. A skill from a harness outside that list keeps a quoted, fully-qualified key. Trade routes are re-keyed by partner: one entry per peer carrying its `export` and `import` kinds, with a direction it does not trade simply absent. The previous fully-qualified top-level shape is not read: an unmigrated file fails naming the shape expected, with no dual parse or fallback.
- A configured private GitHub harness can opt into `auth = "github-cli"`: KI obtains a token through the authenticated GitHub CLI, sends it only to the matching commit-pinned codeload archive request, follows no redirects, and neither stores nor displays the credential.

### Distribution baseline

- `install.sh`
- `ki(1)`
