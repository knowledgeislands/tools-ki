# CLI-004: public KI workspace guidance

## Origin and relationship

Origin: `tools-ki`, [KI-TOOL-CLI-004](../../../docs/roadmap/KI-TOOL-CLI-004-add-explicit-ki-workspaces.md).

Receiving owner: `ki-website`.

Relationship: non-blocking. CLI-004 is implemented and this handoff does not block its acceptance; the Website owns whether, when, and how it incorporates public end-user guidance.

## Requested public guidance

Explain that `ki workspace` manages a KI-owned `.ki-workspace.toml` in the physical current directory.

The file uses `schema = 1`, a required `default` group, and named ordered `repositories` path-or-pattern arrays.

Users initialise and maintain it with `ki workspace init`, `list`, `show <group>`, `add <group> <path-or-pattern>`, and `remove <group> <path-or-pattern>`.

Every `ki repo` command accepts either repeated `--repo <path-or-pattern>` selectors or one `--workspace <group>` selector; the options are mutually exclusive.

Without either selector, the direct-CWD workspace default is selected before a direct-CWD `.mgitconfig`; then ordinary one-repository discovery remains the fallback.

Workspace paths and patterns resolve from the workspace directory, validation fails for malformed files, invalid members, unmatched patterns, and duplicate physical roots, and KI never searches ancestor directories for a workspace or `mgit` configuration.

Workspace management changes only the workspace definition. Selecting a group does not change the semantics or lifecycle ownership of the chosen repository operation.

## Canonical evidence

The executable's exact grammar and behaviour remain canonical in `tools-ki`: [README](../../../README.md), [manual](../../../man/ki.1), and the CLI-004 roadmap item above.

Remove this handoff when `ki-website` records adoption, decline, or supersession.
