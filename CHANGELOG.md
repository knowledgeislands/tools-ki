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

- `ki agora create <name>`
- `ki agora add <name> <directory>`
- `ki agora remove <name> <project>`
- `ki agora discover <name> <directory>`
- `ki agora list`
- `ki agora show <agora>`
- `ki agora open <agora>`

#### Repository options

- `ki repo --repo <path-or-pattern>`
- `ki repo --agora <name>`

#### Repository management

- `ki repo init`
- `ki repo audit`
- `ki repo conform`
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
- Local `ki registry add` records every selected physical KI repository root without applying repairs; `ki repo conform` does the same before evaluating its declaration or conformance findings.

#### Harness management

- `ki harness info`
- `ki harness list`
- `ki harness install`
- `ki harness reinstall`
- `ki harness uninstall`

#### Trades

- `ki trade routes add`
- `ki trade routes remove`
- `ki trade routes list [--estate] [--incomplete] [--svg [path]]`
- `ki trade routes check`
- `ki trade new`
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
- `$XDG_CONFIG_HOME/ki/agoras/<name>.ki-agora` profiles define named user-level project collections for repository selection and ordered Zed windows.
- `ki repo conform` stages safe writes until every initial audit passes, labels proposed and applied writes separately, and leaves proposed conform writes unapplied when an initial audit blocks publication.
- `ki repo roadmap list` is a framed horizon- and lifecycle-grouped text inventory with per-repository import and export trade context.
- Local `ki registry add` records every selected physical KI repository root without applying repairs; `ki repo conform` does the same before evaluating its declaration or conformance findings.
- `ki trade routes list [--estate] [--incomplete]` is a framed local or registered-estate route inventory; `--svg` renders the estate as a self-contained SVG diagram instead, collapsing reciprocal declarations into one edge per repository pair.
- `ki trade new` creates a local export once this repository declares the route; receiver activation remains reciprocal.
- `ki trade list` is a framed registered-estate inventory.

### Distribution baseline

- `install.sh`
- `ki(1)`
