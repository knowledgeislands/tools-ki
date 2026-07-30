# Changelog

All notable changes to this project are documented here.

This changelog records the V1 release baseline. It does not retroactively track individual 0.x releases; their tags and commit history remain the record of that run-up.

## [1.0.0] — in progress

Pre-V1 work is summarized as this baseline; separate 0.x release entries are not maintained.

### Shipped commands

#### General

- `ki`
- `ki help`

#### Installation

- `ki bootstrap`
- `ki completions <shell>`
- `ki outdated`
- `ki missing`
- `ki update`
- `ki search`
- `ki cleanup`

#### Diagnostics

- `ki version`
- `ki diag`
- `ki doctor`
- `ki repo diag`
- `ki docs`

#### User management

- `ki list`
- `ki skill add`
- `ki skill remove`

#### Workspace management

- `ki workspace init`
- `ki workspace list`
- `ki workspace show <group>`
- `ki workspace add <group> <path-or-pattern>`
- `ki workspace remove <group> <path-or-pattern>`

#### Repository options

- `ki repo --repo <path-or-pattern>`
- `ki repo --workspace <group>`

#### Repository management

- `ki repo audit`
- `ki repo conform`
- `ki repo register`
- `ki repo list`
- Local `ki repo register` records every selected physical KI repository root without applying repairs; `ki repo conform` does the same before evaluating its declaration or conformance findings.
- `ki repo plan list`
- `ki repo educate`
- `ki repo skill add`
- `ki repo skill remove`
- `ki repo upgrade`

#### Harness management

- `ki harness info`
- `ki harness list`
- `ki harness install`
- `ki harness reinstall`
- `ki harness uninstall`

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
