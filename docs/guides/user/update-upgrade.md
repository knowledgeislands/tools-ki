# Update and upgrade

`ki update` refreshes verified installation surfaces.

`ki repo upgrade` refreshes the verified harness providers selected by one repository's declarations.

Neither command activates or deactivates skills.

## `ki update`

`ki update` refreshes every installed harness that has configured immutable release evidence.

It retains every capability currently supplied by a refreshed harness, so existing user and repository skill links remain valid.

The command also updates the executable only when the running regular executable matches an installer receipt written by a verified `install.sh` installation.

Use `ki update --cli` to require that executable update target.

Linked development checkouts and externally managed executables, including Homebrew installations, are not self-updated.

Use their owning checkout or distribution manager instead.

## `ki repo upgrade`

Run `ki repo upgrade` from a KI repository, or pass `--repo <path>` to select one explicitly.

It reads the repository's declared skills, requires each provider to resolve uniquely, and refreshes each distinct supplying harness only from configured immutable evidence.

An unavailable, ambiguous, or capability-removing replacement is refused before that provider is changed.
