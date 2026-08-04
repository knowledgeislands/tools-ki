# Changelog

All notable changes to this project are documented here.

This changelog records the V1 release baseline. It does not retroactively track individual 0.x releases; their tags and commit history remain the record of that run-up.

## [1.0.0] — in progress

Pre-V1 work is summarized as this baseline; separate 0.x release entries are not maintained.

### Shipped commands

#### General

- `ki`
- `ki --help`

#### Installation

- `ki bootstrap`

#### Local management

- `ki --version`
- `ki manage completion <shell>`
- `ki manage outdated`
- `ki manage missing`
- `ki manage update`
- `ki manage cleanup`
- `ki manage diag`
- `ki manage doctor`
- `ki manage docs`
- `ki manage list`
- `ki manage search`

#### User management

- `ki skill add`
- `ki skill remove`

#### Workspace management

- `ki workspace init`
- `ki workspace register`
- `ki workspace list`
- `ki workspace show <group>`
- `ki workspace add <group> <path-or-pattern>`
- `ki workspace remove <group> <path-or-pattern>`
- `.ki-workspace.toml` uses the sole schema 1 path-keyed typed-member map, including nested workspace recursion and physical post-order registration; other schemas and historical array or flat `repositories` groups are rejected.

#### Agora management

- `ki agora list`
- `ki agora show <agora>`
- `ki agora open <agora>`
- `.ki-agora` profiles define named multi-project workspaces rendered as ordered Zed windows.

#### Repository options

- `ki repo --repo <path-or-pattern>`
- `ki repo --workspace <group>`

#### Repository management

- `ki repo init`
- `ki repo audit`
- `ki repo conform`
- `ki repo conform` stages safe writes until every initial audit passes, labels proposed and applied writes separately, and leaves proposed conform writes unapplied when an initial audit blocks publication.
- `ki repo plan list`
- `ki repo educate`
- `ki repo repair`
- `ki repo skill add`
- `ki repo skill remove`
- `ki repo upgrade`

#### Repository register

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

- `ki trade routes add|remove|list|check`
- `ki trade new|receive|list|show|release|prune`

#### Acquisition

- `ki acquire chatgpt import`

#### Development

- `ki dev local set <local-harness-path>`
- `ki dev local on`
- `ki dev local off`
- `ki dev skill rubric`

### Distribution baseline

- `install.sh`
- `ki(1)`
