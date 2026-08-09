# Specifications

This corpus records the current observable behaviour of bounded `tools-ki` areas so maintainers can identify the contract and its verification without reconstructing it from source code and tests alone.

## How these specifications fit

Specifications describe what the built CLI does. Decision Records explain why a behaviour was chosen, guides explain how to operate it, and roadmap items record when planned work will happen.

## Reading a requirement

Each numbered requirement states one current behaviour using RFC-2119 language and names a concrete verification hook.

```markdown
### REPO-AUDIT-001 — Example behaviour

The command MUST provide an observable behaviour.

_Verify:_ a named CLI test asserts the behaviour.
```

## ID scheme

Each area owns one uppercase prefix. Identifiers use `<PREFIX>-NNN`; serials are zero-padded, sequential and append-only within their area, and never reused.

## Gaps convention

Unbuilt or uncertain behaviour belongs in an area's unnumbered `## Gaps` section until it is true and has a concrete verification hook.

## Areas

| File                     | Prefix       | Covers                                                         |
| ------------------------ | ------------ | -------------------------------------------------------------- |
| acquisition.md           | `ACQUIRE`    | Knowledge Exchange Package acquisition                         |
| agoras.md                | `AGORA`      | Named user-level repository groups                             |
| bootstrap.md             | `BOOT`       | First-time user activation and refresh                         |
| cli.md                   | `CLI`        | Root command discovery, version, and failure boundary          |
| development.md           | `DEV`        | Controlled local Harness development                           |
| harnesses.md             | `HARN`       | Verified compatible Harness lifecycle                          |
| management.md            | `MANAGE`     | User inventory, diagnosis, updates, and shell integration      |
| registry.md              | `REGISTRY`   | Explicit repository registration and inventory                 |
| repository-audit.md      | `REPO-AUDIT` | `ki repo audit` selection, results, output, and multi-repo use |
| repository-operations.md | `REPO-OPS`   | Repository targeting, conform, repair, and provider upgrades   |
| skills.md                | `SKILL`      | User and repository skill activation plus rubrics              |
| trades.md                | `TRADE`      | Local directional cross-repository trade operations            |
