# CLI-006: public multi-repository target guidance

## Origin and relationship

Origin: `tools-ki`, [KI-TOOL-CLI-006](../../../docs/roadmap/KI-TOOL-CLI-006-add-multi-repository-invocations.md).

Receiving owner: `ki-website`.

Relationship: non-blocking. CLI-006 is implemented and this handoff does not block its acceptance; the Website owns whether, when, and how it incorporates public end-user guidance.

## Requested public guidance

Explain that every `ki repo` operation accepts repeated `--repo <path-or-pattern>` selectors.

Literal paths and patterns resolve physical KI repository roots in deterministic order; an unmatched pattern, invalid root, or duplicate physical root rejects the request before any operation begins.

Without `--repo`, `ki` checks only the physical current working directory for a regular `.mgitconfig`, follows its declared repository and nested-container entries downward, ignores owned links, and never invokes `mgit` or searches ancestor directories for this configuration.

Without a direct-CWD configuration, `ki` retains ordinary single-repository CWD discovery.

After selection, targets run in order. Read-only operations preserve per-target diagnostics; a mutation failure leaves earlier successful target mutations intact and returns non-zero.

## Canonical evidence

The executable's exact grammar and behaviour remain canonical in `tools-ki`: [README](../../../README.md), [manual](../../../man/ki.1), and the CLI-006 roadmap item above.

Remove this handoff when `ki-website` records adoption, decline, or supersession.
