# Standing knowledge intake

This guide is for repository owners who want one registered Knowledge Islands repository to retain a narrowly defined class of knowledge from another without creating an itemized trade for every capture. The result is an exact reciprocal grant and a receiver-local, commit-pinned provenance block; neither repository gains authority to write to the other.

The observable command contract is specified by [TRADE-009 through TRADE-011](../specs/trades.md#trade-009--receiver-owned-knowledge-subtypes).

## Prerequisites

Both repositories must be registered locally and must already have an active ordinary `knowledge` route in the intended direction. The receiving repository owns the subtype name and description.

The source material must be committed. Capture requires a full 40-character commit, repository-relative source path, and anchor.

## Declare the receiver-owned subtype

Run this in the receiving repository:

```bash
ki trade subtypes add shared-capability-maintenance \
  --description "Maintenance evidence about receiver-owned shared capabilities."
```

Inspect the local vocabulary with `ki trade subtypes list`. A subtype cannot be removed while any local standing import still uses it.

## Declare both sides of the grant

Run this in the receiver:

```bash
ki trade standing add https://github.com/owner/source \
  --direction import \
  --subtype shared-capability-maintenance
```

Run the reciprocal declaration in the source:

```bash
ki trade standing add https://github.com/owner/receiver \
  --direction export \
  --subtype shared-capability-maintenance
```

Check either repository with `ki trade standing list` or select the exact relationship:

```bash
ki trade standing check https://github.com/owner/source \
  --direction import \
  --subtype shared-capability-maintenance
```

`active` means the ordinary knowledge route and exact reciprocal standing declarations are present and the receiver defines the subtype. Any one-sided, unknown, malformed, ambiguous, or revoked declaration remains inactive. `--incomplete` limits `ki trade standing list` to those inactive declarations.

## Capture committed source evidence

Choose an existing Markdown file in the receiver and an anchor describing where the retained knowledge belongs. From the receiver, run:

```bash
ki trade standing capture https://github.com/owner/source \
  --subtype shared-capability-maintenance \
  --source-ref 0123456789abcdef0123456789abcdef01234567:docs/source.md#finding \
  --capture docs/roadmap/RECEIVER-GOV-001.md#source-analysis
```

The command first re-checks the active exact grant and resolves the commit and source path in the locally registered source checkout. It then appends a marked `ki-trades/standing-intake/v1` TOML block to the named receiver file. The block records a unique `STI-*` identity, UTC capture time, source and receiver identities, exact source reference, subtype, and capture location.

The operation changes only the current receiver repository. Review and commit the receiver file normally. Revoking the grant later blocks new captures but does not erase previously committed provenance.

## Use an itemized trade when standing authority does not fit

Standing intake is knowledge-only and intentionally narrow. Use `ki trade prepare <repository> --kind knowledge ...` when the insight does not match an active exact subtype, needs receiver review before retention, introduces a distinct decision or work scope, or cannot be pinned to the required source evidence. A standing grant never grants roadmap priority, implementation, publication, acceptance, completion, Agora, or peer-write authority.

## Remove the grant

Remove each repository's own declaration locally:

```bash
ki trade standing remove https://github.com/owner/source \
  --direction import \
  --subtype shared-capability-maintenance
```

After the receiver has removed every standing import using the subtype, it may remove the definition:

```bash
ki trade subtypes remove shared-capability-maintenance
```

If a command refuses removal, run `ki trade standing list` and remove the named local dependency first. No removal command changes the peer repository.
