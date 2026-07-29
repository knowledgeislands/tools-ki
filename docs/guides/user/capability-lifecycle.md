# Capability lifecycle

`ki harness install`, `ki harness reinstall`, and `ki harness uninstall` manage verified installed harness payloads.

They do not activate or deactivate skills for a user or repository.

## Harness identifiers

Use a harness identifier in `owner/name` form, such as `example/harness`.

Lifecycle operations do not accept capability-qualified or bare-skill targets.

## Operations

`ki harness install <harness-id>` installs an absent configured harness, or reports an existing installed harness.

`ki harness reinstall <harness-id>` replaces an installed configured harness only after its replacement archive passes integrity and capability inspection.

`ki harness uninstall <harness-id>` removes an installed non-canonical harness whose recognised payload belongs to KI.

Lifecycle commands apply their requested change immediately after validation; only `ki acquire chatgpt import` and `ki repo conform` provide a dry-run preview.

## Activation boundary

Use `ki skill add` or `ki repo skill add` to activate an installed skill.

`ki harness reinstall` and `ki harness uninstall` refuse a harness that supplies active user skills.

Remove user declarations first with `ki skill remove`, then repeat the lifecycle command. Repository declarations are managed independently with `ki repo skill remove`.

The canonical `knowledgeislands/ki-agentic-harness` cannot be uninstalled.

When it is development-linked, restore its verified archive with `ki dev local off` before reinstalling it.
