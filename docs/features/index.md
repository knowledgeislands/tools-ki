# Feature Definitions

This corpus records the current observable behaviour of bounded `tools-ki` areas so maintainers can identify the contract and its verification without reconstructing it from source code and tests alone.

## How these definitions fit

Feature Definitions describe what the built CLI does. Decision Records explain why a behaviour was chosen, guides explain how to operate it, and roadmap items record when planned work will happen.

## Reading a requirement

Each numbered requirement states one current behaviour using RFC-2119 language and names a concrete verification hook.

```markdown
### REPO-AUDIT-001 — Example behaviour

The command MUST provide an observable behaviour.

_Verify:_ a named CLI test asserts the behaviour.
```

## ID scheme

`REPO-AUDIT-NNN` identifiers belong to the repository-audit area. Serials are zero-padded, sequential, append-only, and never reused.

## Gaps convention

Unbuilt or uncertain behaviour belongs in an area's unnumbered `## Gaps` section until it is true and has a concrete verification hook.

## Areas

| File                | Prefix       | Covers                                                         |
| ------------------- | ------------ | -------------------------------------------------------------- |
| repository-audit.md | `REPO-AUDIT` | `ki repo audit` selection, results, output, and multi-repo use |
