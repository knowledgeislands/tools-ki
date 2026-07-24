# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

The first delivery sequence is a zero-dependency `ki` seed (`--help`, `--version`, and `doctor`), followed by a user-assisted `ki acquire chatgpt import` command that produces a Knowledge Export Package (KEP).

## Acquire a local ChatGPT capture

Prepare a capture using the [controlled local-capture format](docs/guides/user/chatgpt-local-capture.md), then import it into a new output directory:

```sh
ki acquire chatgpt import ./capture --output ./conversation.kep
```

Use `--dry-run` to validate without creating output, or `--json` for a versioned machine-readable result. The command is local only: it does not contact ChatGPT, automate a browser, read credentials, discover a repository, or extract knowledge.

## Install

Install the released CLI with Homebrew:

```sh
brew install knowledgeislands/tap/ki
```

For a local checkout, use the repository's `install.sh` installer instead.

See the [roadmap](docs/roadmap/cli/ROADMAP.md).
