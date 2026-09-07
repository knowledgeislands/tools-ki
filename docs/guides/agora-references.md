# Associate external Agora references

An Agora owner may declare an ordinary Git repository in `references` when it belongs in the working set but is not a Knowledge Islands member. The portable declaration contains only the canonical repository identity; each machine chooses its own checkout explicitly.

## Associate a checkout

Clone or otherwise prepare the repository yourself, then associate its absolute checkout root:

```sh
ki agora reference set https://github.com/example/plain-repository /absolute/path/to/plain-repository
```

The command requires the identity to appear in a registered Agora owner's `references` declaration. It verifies that the path is a physical Git checkout root and that its `origin` resolves to the same canonical GitHub identity. It does not add `.ki.toml`, register the checkout, or write into it.

Use `--dry-run` to validate the proposed association without changing local state. Re-running `set` with another valid checkout replaces the existing association for that identity.

## Inspect and use references

List the machine-local associations:

```sh
ki agora reference list
```

Resolved references participate in the same ordered projection used by `ki agora roots`, `ki agora open`, and `ki agora inspect`. `ki agora show` labels owner, member, and reference roots, while `ki agora audit` reports unresolved reference diagnostics.

An unresolved reference does not invalidate reciprocal membership. It is omitted from projected roots with one status:

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

Promotion to KI membership is a separate reciprocal governance change: remove the identity from the owner's `references`, add it to `members`, and add matching consent in the member repository. Once the declarations and local KI registration resolve, `ki` treats it only as a member and ignores any stale reference association; remove that stale local state when convenient.

The observable contract is specified in [Agoras](../specs/agoras.md).
