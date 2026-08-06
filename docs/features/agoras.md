# Agoras — AGORA

This area specifies named user-level repository groups; see the [Feature Definitions index](index.md) for corpus conventions and registered prefixes.

## Profile lifecycle

### AGORA-001 — Named profile creation

`ki agora create` MUST create an empty named Agora profile.

_Verify:_ `src/tests/cli/root/help.test.ts` — help for `ki agora` describes creating an empty named Agora profile; `src/tests/cli/agora/agora.test.ts` covers profile creation.

### AGORA-002 — Physical repository discovery

`ki agora discover` MUST discover physical KI repository roots beneath the selected path without following symbolic links.

_Verify:_ `src/commands/agora/discover.ts` — `discoverAgoraRepositories`; `src/tests/cli/agora/agora.test.ts` covers discovery and unsafe profile paths.

### AGORA-003 — Validated profile documents

`ki agora` MUST reject malformed or unsafe profile documents before using them.

_Verify:_ `src/tests/cli/agora/agora.test.ts` — `rejects malformed profile documents` and `rejects missing and unsafe profile paths`.

### AGORA-004 — Explicit profile membership

`ki agora add` and `ki agora remove` MUST add or remove one named physical project from an explicit Agora profile while preserving the profile's validated membership model.

_Verify:_ `src/tests/cli/agora/agora.test.ts` — `creates, mutates, discovers, and selects named global repository profiles`.

### AGORA-005 — Profile inspection and opening

`ki agora list` and `ki agora show` MUST expose the available and selected profile state, while `ki agora open` MUST launch the selected Zed profile in one process and report a launch failure.

_Verify:_ `src/tests/cli/agora/agora.test.ts` — `lists, shows, and opens a project-name ordered Zed profile in one window` and `reports Zed launch failures with and without process output`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
