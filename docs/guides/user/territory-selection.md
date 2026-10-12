# Select a territory or estate

Run `ki territory list` to discover registered Capital handles. A Capital's explicit `territory_prefix` is its sole handle; without that declaration, use its local registry key. Membership comes from the Capital's canonical `territory_members`, including the Capital itself.

## Select and narrow

Use `ki territory show -t knowledge-islands --verbose` for one territory, `ki territory show --estate` for the registered estate, or `ki territory show --principals` for the territory Capitals alone. Add `-f tools- -f apps-` to keep directory basenames starting with either literal prefix. Matching is case-sensitive; glob metacharacters are ordinary characters. An empty prefix or no matches fails.

Supported repository commands use the same selectors, for example `ki repo -t knowledge-islands -f tools- audit`. Filter alone narrows the existing current-repository or mGit workspace default. Primary territory, estate and explicit repository scopes cannot be combined.

## Open the Principals

`--principals` selects every registered territory Capital and no other repository. The system Capital comes first: the one whose territory includes the canonical KI Harness, `knowledgeislands/ki-agentic-harness`, which in this estate is Knowledge Islands Principal. The other Capitals follow alphabetically by territory name, then by handle. A Capital whose checkout is unavailable cannot be recognised as one and is left out.

Use `ki territory open --principals --target zed` to open them in that order. Zed adds each opened folder to the top of its project list, so `ki` opens them in reverse and the list reads in principals order; VS Code and Delta receive the order directly. Filters narrow the Capitals as usual, for example `ki territory open --principals -f ki- -f hnr- --target vscode`.

## Consume roots safely

Use `ki territory roots --null -t knowledge-islands -f tools-` for NUL-delimited absolute primary checkout roots. Buffer the complete output and check exit status before acting. This handles paths containing spaces or line feeds and gives no partial stdout on failure.

## Verify and recover

Use `ki territory audit -t knowledge-islands` to validate the selected territory. Missing registration fails before filters can exclude a member: register the canonical member identity first. An unavailable selected root or checkout identity/Capital mismatch fails before operations. A registered unavailable root excluded by a filter does not block the remaining selection.

Use `ki territory open -t knowledge-islands --target zed` to open local roots. For a read-only projection comparison, use `ki territory inspect -t knowledge-islands --target vscode --workspace <absolute-code-workspace-file>` or select an explicit Zed workspace ID. Legacy Agora membership, inclusions and reference association commands are retired; existing historical local files remain untouched.
