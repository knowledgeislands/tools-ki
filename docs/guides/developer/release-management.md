# Release management

`tools-ki` releases compiled archives for `darwin-arm64`, `darwin-x64`, and glibc `linux-x64`.

Each release contains three `ki-vX.Y.Z-<target>.tar.gz` archives, each holding only `ki` and `man/ki.1`, plus the Ed25519-signed `ki-checksums.txt` manifest and `ki-checksums.txt.sig` signature.

The public installer verifies the manifest signature before it downloads an archive, verifies the archive checksum and layout, then stages and installs the executable and manual.

## Create the signing key

Create the key pair once on a trusted development machine.

```sh
key_dir="$HOME/Documents/ki-release-key"
umask 077
mkdir -p "$key_dir"
test ! -e "$key_dir/ki-release-signing-key.pem" || {
  echo "A signing key already exists at $key_dir; stopping without overwriting it."
  exit 1
}
openssl genpkey -algorithm ED25519 -out "$key_dir/ki-release-signing-key.pem"
openssl pkey -in "$key_dir/ki-release-signing-key.pem" -pubout -out "$key_dir/ki-release-signing-public.pem"
chmod 600 "$key_dir/ki-release-signing-key.pem"
chmod 644 "$key_dir/ki-release-signing-public.pem"
```

Keep `ki-release-signing-key.pem` private: do not commit it, paste it into chat, or send it by email.

The public-key file is safe to commit and distribute. Copy it into the tracked trust-anchor file and commit it with release-maintenance work:

```sh
cp "$key_dir/ki-release-signing-public.pem" release/ki-release-signing-public.pem
```

The tracked [public key](../../../release/ki-release-signing-public.pem) must match the private key stored in GitHub; the workflow compares them before it signs a release.

## Configure the solo-maintainer release environment

The release workflow reads `KI_RELEASE_SIGNING_KEY` only from a GitHub Actions **environment secret**. Do not create it as a general repository secret: a release tag could otherwise select workflow code that reads it.

This is the active configuration for a sole maintainer; it does not need a second GitHub account:

1. Open **Settings** → **Environments** → **New environment** and name it `release`.
2. Under deployment branches and tags, select **Selected branches and tags**, add a **Branch** rule, and enter `main`. Do not allow tags or other branches to deploy.
3. Do not configure **Required reviewers** while this is a solo-maintainer repository: a required review would prevent you from completing a release.
4. Under **Environment secrets**, add `KI_RELEASE_SIGNING_KEY` and paste the private PEM file contents. Never paste that file into chat, an issue, or a repository file.

The workflow is manually dispatched from `main` and the secret is scoped to its `release` publishing job rather than to the repository's other workflows. See [GitHub's guide to environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) and [managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Future: team release protection

When a second trusted maintainer joins, strengthen the above configuration with a genuine two-person approval gate:

1. Give the independent reviewer at least **Read** access to `knowledgeislands/tools-ki`.
2. Protect `main` with a ruleset that requires pull requests and one approving review from that person, without a release-publisher bypass.
3. In the `release` environment, enable **Required reviewers**, select that person, enable **Prevent self-review**, and disable administrator bypass.

A separate GitHub account controlled by the same person can add a small operational barrier, but it is not an independent review. This is future hardening guidance, not a roadmap item.

## Publish a release

The release workflow is manually dispatched from protected `main`, then checks out the exact requested release tag. Create and push an exact semantic version tag only after the intended release commit is on `main`:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

Open **Actions** → **Release** → **Run workflow**, choose `main`, and enter the same `vX.Y.Z` version. The workflow builds the three archives, signs the manifest, creates a draft release, re-downloads and verifies its published assets, then publishes it. If future team protection is enabled, the independent reviewer approves the pending `release` deployment first.

After the first verified release, update the Homebrew tap and the KI Website install redirect in their owning repositories.
