# Select a territory or estate

Run `ki territory list` to discover registered Capital handles. A Capital's explicit `territory_prefix` is its sole handle; without that declaration, use its local registry key. Membership comes from the Capital's canonical `territory_members`, including the Capital itself.

## Select and narrow

Use `ki territory show -t ki --verbose` for one territory, or `ki territory show --estate` for the registered estate. Add `-f tools- -f apps-` to keep directory basenames starting with either literal prefix. Matching is case-sensitive; glob metacharacters are ordinary characters. An empty prefix or no matches fails.

Supported repository commands use the same selectors, for example `ki repo -t ki -f tools- audit`. Filter alone narrows the existing current-repository or mGit workspace default. Primary territory, estate and explicit repository scopes cannot be combined.

## Consume roots safely

Use `ki territory roots --null -t ki -f tools-` for NUL-delimited absolute primary checkout roots. Buffer the complete output and check exit status before acting. This handles paths containing spaces or line feeds and gives no partial stdout on failure.

## Verify and recover

Use `ki territory audit -t ki` to validate the selected territory. Missing registration fails before filters can exclude a member: register the canonical member identity first. An unavailable selected root or checkout identity/Capital mismatch fails before operations. A registered unavailable root excluded by a filter does not block the remaining selection.

Use `ki territory open -t ki --target zed` to open local roots. For a read-only projection comparison, use `ki territory inspect -t ki --target vscode --workspace <absolute-code-workspace-file>` or select an explicit Zed workspace ID. Legacy Agora membership, inclusions and reference association commands are retired; existing historical local files remain untouched.
