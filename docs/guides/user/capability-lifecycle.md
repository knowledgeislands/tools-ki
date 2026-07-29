# Capability lifecycle

`ki install`, `ki reinstall`, and `ki uninstall` manage verified installed harness payloads.

They do not activate or deactivate skills for a user or repository.

## Targets

Use one of these target forms:

- `owner/name` manages the named harness.
- `owner/name:skill` proves that the named supplier provides the requested skill before installing or replacing it.
- `skill` resolves only when exactly one installed harness provides that skill.

A bare skill with no installed provider names no supplier to acquire, so use a qualified target to install it.

A bare skill with more than one installed provider is rejected as ambiguous; select its supplying harness explicitly.

## Operations

`ki install <target>` installs an absent configured harness, or reports an existing installed target.

`ki reinstall <target>` replaces an installed configured harness only after its replacement archive passes integrity and capability inspection.

`ki uninstall <target>` removes an installed non-canonical harness whose recognised payload belongs to KI.

Lifecycle commands apply their requested change immediately after validation; only `ki acquire chatgpt import` and `ki repo conform` provide a dry-run preview.

## Activation boundary

Use `ki skill add` or `ki repo skill add` to activate an installed skill.

`ki reinstall` and `ki uninstall` refuse a harness that supplies active user skills.

Remove user declarations first with `ki skill remove`, then repeat the lifecycle command. Repository declarations are managed independently with `ki repo skill remove`.

The canonical `knowledgeislands/ki-agentic-harness` cannot be uninstalled.

When it is development-linked, restore its verified archive with `ki dev off` before reinstalling it.
