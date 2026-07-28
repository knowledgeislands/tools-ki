# tools-ki

The home of `ki`, the Knowledge Islands command-line interface (CLI).

## Place in the Knowledge Islands ecosystem

`tools-ki` is the canonical source of the `ki` executable platform. It installs verified compatible harnesses, resolves repositories, activates skills in explicit user or repository scope, and hosts registered native operations. It consumes reusable agentic capabilities from the [KI Agentic Harness](https://github.com/knowledgeislands/ki-agentic-harness), does not define their standards, and supplies implementation evidence that [KI Specifications](https://github.com/knowledgeislands/ki-specifications) may formalise as portable contracts.

[Arcadia Principal](https://github.com/knowledgeislands/ki-arcadia-principal) remains the source of Knowledge Islands philosophy and model. The [KI Website](https://github.com/knowledgeislands/ki-website) may vendor source-labelled CLI material for public publication, while this repository remains canonical for the executable and its release artifacts. The mirrored [ecosystem decision](docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md) defines the five authorities and publication flows.

The seed delivery established the `ki` command channel. The active TypeScript command host provides help, version, XDG inspection, and a user-assisted `ki acquire chatgpt import` command that produces a Knowledge Export Package (KEP).

## Acquire a local ChatGPT capture

Prepare a capture using the [controlled local-capture format](docs/guides/user/chatgpt-local-capture.md), then import it into a new output directory:

```sh
ki acquire chatgpt import ./capture --output ./conversation.kep
```

Use `--dry-run` to validate without creating output, or `--json` for a versioned machine-readable result. The command is local only: it does not contact ChatGPT, automate a browser, read credentials, discover a repository, or extract knowledge.

## Manage installed capabilities

`ki install`, `ki reinstall`, and `ki uninstall` manage verified harness payloads without activating or deactivating skills.

Use a harness identifier such as `example/harness`, a supplier-qualified skill such as `example/harness:ki-example`, or an already-installed bare skill name when exactly one harness supplies it.

For target forms, dry-run behavior, and the explicit activation boundary, read the [capability lifecycle guide](docs/guides/user/capability-lifecycle.md).

## Update verified installations

`ki update` refreshes installed harnesses with configured immutable releases and updates the executable only when a verified installer receipt proves that it owns the running regular installation.

`ki upgrade` refreshes the uniquely resolved providers declared by the current KI repository.

Neither command changes user or repository skill activation; read the [update and upgrade guide](docs/guides/user/update-upgrade.md) for target selection and ownership boundaries.

## Install

After the first immutable release, download `install.sh` from an exact released tag, inspect it, then run it with that tag:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' --output install.sh \
  https://raw.githubusercontent.com/knowledgeislands/tools-ki/vX.Y.Z/install.sh
bash ./install.sh vX.Y.Z
```

The installer carries the pinned public key and verifies the release's Ed25519-signed checksum manifest before downloading the platform archive. It supports macOS (Apple Silicon and Intel) and x86_64 glibc Linux. Use an explicit version for every public installation.

The Homebrew tap will move to these same release artifacts after that first immutable release.

`install.sh --link` is exclusively for development from a local checkout. Read the [local development guide](docs/guides/developer/local-development.md) for that path.

The tracked [ki(1) manual](man/ki.1) distinguishes the current command surface from planned alternatives.

See the [roadmap](docs/roadmap/cli/ROADMAP.md).
