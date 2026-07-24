# Local development

`tools-ki` supports a released Homebrew installation and an explicit link to the current checkout. Both expose the same unreleased version while development continues; the link changes which executable runs, not the version number.

## Run the checkout directly

Run the checkout without changing any installation:

```sh
./bin/ki --help
./bin/ki doctor
```

## Link a development command

Install a symbolic link to the current checkout into a dedicated development command directory:

```sh
KI_CLI_INSTALL_DIR="$HOME/.local/ki-dev/bin" ./install.sh --link
PATH="$HOME/.local/ki-dev/bin:$PATH" ki doctor
```

`ki doctor` reports `installation: linked development checkout` when that link is running. The link follows subsequent edits to `bin/ki`; reinstall only when changing its target directory or restoring a regular copied executable.

Use `./install.sh --copy` to install a regular copy into the same selected command directory.

## Compare with Homebrew

Keep the development directory out of `PATH`, or invoke both executables explicitly:

```sh
"$(brew --prefix ki)/bin/ki" --version
./bin/ki --version
```

The first command runs the currently installed Homebrew release. The second runs this checkout.

## Read the manual

The tracked manual is [ki(1)](../../../man/ki.1). Preview it from a checkout with:

```sh
man -l man/ki.1
```

The manual records current commands and planned alternatives separately so command names can change before the first consolidated release.
