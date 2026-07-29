# CLI-003: public governed-work inventory guidance

## Origin and relationship

Origin: `tools-ki`, [KI-TOOL-CLI-003](../../../docs/roadmap/KI-TOOL-CLI-003-add-native-governed-plan-inventory.md).

Receiving owner: `ki-website`.

Relationship: non-blocking. CLI-003 is implemented and this handoff does not block its acceptance; the Website owns whether, when, and how it incorporates public end-user guidance.

## Requested public guidance

Explain that `ki repo plan list` inspects canonical governed work items in one or more selected repositories without changing them.

The default output is deterministic text grouped by repository. `--format json` returns the same stable item fields in one document; `--horizon <value>` and `--status <value>` narrow the displayed records.

The command reports a missing roadmap directory, malformed item, invalid lifecycle status, or unsafe entry as a diagnostic for only that repository, while continuing with the other selected repositories.

It is inspection only: it never creates, transitions, accepts, prunes, or repairs work items. The compatible harness's process skills continue to own all lifecycle changes.

## Canonical evidence

The executable's exact grammar and behaviour remain canonical in `tools-ki`: [README](../../../README.md), [manual](../../../man/ki.1), and the CLI-003 roadmap item above.

Remove this handoff when `ki-website` records adoption, decline, or supersession.
