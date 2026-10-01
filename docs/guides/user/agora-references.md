# Associate external Agora inclusions

An Agora owner may name a canonical repository URL in `includes` when it belongs in the working set without becoming a direct member. Registered repositories resolve from the local KI registry. For an unregistered Git repository, each machine chooses its checkout explicitly.

## Associate a checkout

Clone or otherwise prepare the repository yourself, then associate its absolute checkout root:

```sh
ki agora reference set https://github.com/example/plain-repository /absolute/path/to/plain-repository
```

The command requires the identity to appear in a registered Agora owner's `includes` declaration. It verifies that the path is a physical Git checkout root and that its `origin` resolves to the same canonical GitHub identity. It does not add `.ki.toml`, register the checkout, or write into it.

Use `--dry-run` to validate the proposed association without changing local state. Re-running `set` with another valid checkout replaces the existing association for that identity.

## Inspect and use inclusions

List the machine-local associations:

```sh
ki agora reference list
```

Resolved inclusions participate in the same alphabetical projection used by `ki agora roots`, `ki agora open`, and `ki agora inspect`. When opening a named Agora in Zed, KI adds the owner last because Zed prepends folders in its sidebar; the owner therefore appears first, followed by the other roots in registry-key order. This does not change the canonical roots or VS Code arguments. An included Agora contributes its owner and direct members; its own inclusions are not followed. Human-facing `ki agora list` and `ki agora show` count the owner separately from direct members and included roots; `show --verbose` includes the owner's path once. The system `estate` instead lists registered repositories and has no owner. `ki agora audit` reports unresolved external repository diagnostics.

An unresolved external repository inclusion does not invalidate direct membership. It is omitted from projected roots with one status:

- **unassociated** — no checkout has been selected on this machine.
- **missing** — the selected physical directory is unavailable.
- **ambiguous** — local state contains more than one candidate and must be repaired to one.
- **remote-mismatch** — the path is not a Git checkout root or its canonical `origin` differs.

Correct the checkout or replace the association with `set`, then rerun `ki agora audit <name>`.

## Remove or promote a reference

Remove only the local association with:

```sh
ki agora reference remove https://github.com/example/plain-repository
```

Use `--dry-run` to validate removal first. The command never edits the Agora declaration or referenced checkout.

Promotion to direct membership changes only the owner's declaration: remove the identity from `includes` and add it to `members`. Once local KI registration resolves, `ki` treats it only as a member and ignores any stale reference association; remove that stale local state when convenient.
