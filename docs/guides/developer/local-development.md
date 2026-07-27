# Local development

`tools-ki` supports a released Homebrew installation, a regular locally compiled executable, and an explicit link to the current checkout. Both local modes expose the same unreleased version while development continues; the mode changes which executable runs, not the version number.

## Run the checkout directly

Run the checkout without changing any installation:

```sh
./bin/ki --help
./bin/ki doctor
```

This source entry point requires Bun and runs the typed command modules in `src/` directly.

## Command structure

`src/cli.ts` owns only command assembly, help routing, and exit-code rendering.

Each public command or command group has its own module under `src/commands/`; command modules receive one shared read-only execution context rather than inspecting process state independently.

`src/core/context.ts` resolves the physical current working directory, executable installation mode, XDG KI paths, user home, and an optional ancestor KI repository. Repository discovery searches from the working directory upward for `.ki-config.toml`, but never treats the home directory or filesystem root as a repository. Future `ki repo` commands reuse this context and its explicit `--repo` resolver rather than reimplementing path traversal.

## Install a compiled executable

Build the standalone executable for the current platform, then install a regular copy:

```sh
bun run build
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --copy
PATH="$HOME/.local/ki-dev/bin:$PATH" ki doctor
```

The compiled executable contains the Bun runtime and its dependency graph, so the installed command does not need a checkout or Bun on `PATH`.

## Link a development command

Install a symbolic link to the current checkout into a dedicated development command directory:

```sh
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --link
PATH="$HOME/.local/ki-dev/bin:$PATH" ki doctor
```

`ki doctor` reports `installation: linked development checkout` when that link is running. The command and `ki(1)` links follow subsequent edits to `bin/ki` and `man/ki.1`; reinstall only when changing their target directories or restoring regular copied files.

Set `KI_MAN_INSTALL_DIR` when the manual should be installed outside the default sibling `share/man/man1` directory.

## PATH precedence

The first `ki` directory in `PATH` wins. If Homebrew's `bin` directory comes before the linked development directory, `ki` runs the Homebrew release instead of this checkout.

To make the default linked installation take precedence, place the local bin directory before Homebrew in the shell startup configuration:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Open a new shell, or run `rehash` in Zsh, after changing `PATH`. Use `command -v ki` or `which -a ki` to inspect the selected executable and all available candidates.

## Compare with Homebrew

To compare the two installations without changing `PATH`, invoke both executables explicitly:

```sh
"$(brew --prefix ki)/bin/ki" --version
./bin/ki --version
```

The first command runs the currently installed Homebrew release. The second runs this checkout.

## Configure release signing

The verified-release installer will use a signed checksum manifest. Its release workflow will read the private signing key only from the `KI_RELEASE_SIGNING_KEY` GitHub Actions repository secret; the repository and released installer will carry only its public key.

Create the key pair once on a trusted development machine. The commands refuse to overwrite an existing private key and restrict its permissions:

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

Keep `ki-release-signing-key.pem` private: do not commit it, paste it into chat, or send it by email. The public-key file is safe to commit and distribute.

Do not create `KI_RELEASE_SIGNING_KEY` as a general repository secret. A release tag can otherwise select workflow code that reads it. Instead, in GitHub open `knowledgeislands/tools-ki`, select **Settings** → **Environments** → **New environment**, and create `release`. Require a reviewer other than the person publishing the release, prevent self-approval or bypass, and limit deployment to protected release tags. Add `KI_RELEASE_SIGNING_KEY` under that environment's **Environment secrets**. GitHub exposes an environment secret to a job only after its protection rules pass. See [GitHub's guide to environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) and [repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets?tool=webui).

Copy the private key directly from the file rather than printing it into a shared terminal or chat transcript:

```sh
pbcopy < "$key_dir/ki-release-signing-key.pem"
```

Copy the public key into the repository's tracked trust-anchor file, then commit it with the release-maintenance work:

```sh
cp "$key_dir/ki-release-signing-public.pem" release/ki-release-signing-public.pem
```

The tracked [public key](../../../release/ki-release-signing-public.pem) is safe to inspect and distribute. The release workflow signs only with the matching `KI_RELEASE_SIGNING_KEY` secret; if the two files do not belong to the same key pair, release verification will fail.

## Read the manual

The tracked manual is [ki(1)](../../../man/ki.1). Preview it from a checkout with:

```sh
man -l man/ki.1
```

The manual groups current and planned commands together by purpose; `[planned]` forms can change before the first consolidated release.
