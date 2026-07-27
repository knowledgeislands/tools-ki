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

## Configure GitHub release protection

The release workflow reads `KI_RELEASE_SIGNING_KEY` only from a GitHub Actions **environment secret**. Do not create it as a general repository secret: a release tag could otherwise select workflow code that reads it.

1. Add a second, trusted GitHub account to `knowledgeislands/tools-ki` with at least **Read** access. This account is the independent release reviewer; it must not be the account that starts a release. A trusted colleague or separately controlled account is suitable.
2. Protect `main`: open **Settings** → **Rules** → **Rulesets** → **New branch ruleset**; target `main`; require pull requests and one approving review from the independent account. Do not permit bypass for the release publisher.
3. Open **Settings** → **Environments** → **New environment** and name it `release`. Under deployment branches and tags, select only `main` (or **Protected branches only** after the `main` ruleset is active).
4. Under deployment protection rules, enable **Required reviewers**, select the independent account, and enable **Prevent self-review**. Disable any administrator bypass option.
5. Under **Environment secrets**, add `KI_RELEASE_SIGNING_KEY` and paste the private PEM file contents. Never paste that file into chat, an issue, or a repository file.

GitHub exposes an environment secret to the publisher job only after the protection rules pass. See [GitHub's guide to environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) and [managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Publish a release

The release workflow is manually dispatched from protected `main`, then checks out the exact requested release tag. Create and push an exact semantic version tag only after the intended release commit is on `main`:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

Open **Actions** → **Release** → **Run workflow**, choose `main`, and enter the same `vX.Y.Z` version. The independent reviewer approves the pending `release` deployment. The workflow builds the three archives, signs the manifest, creates a draft release, re-downloads and verifies its published assets, then publishes it.

After the first verified release, update the Homebrew tap and the KI Website install redirect in their owning repositories.
