# Standing knowledge intake

This guide is for repository owners who want one registered Knowledge Islands repository to retain a narrowly defined class of knowledge from another without creating an itemized trade for every capture. The result is a standing grant declared once by the territory Capital and a receiver-local, commit-pinned provenance block; neither repository gains authority to write to the other.

## Prerequisites

Both repositories must be members of the same territory, must be registered locally alongside their territory Capital, and must declare `[skills.ki-trades]`. The Capital's policy must already grant an ordinary `knowledge` channel in the intended direction.

The source material must be committed. Capture requires a full 40-character commit, repository-relative source path, and anchor.

## Define the subtype and grant in the Capital

Subtypes and standing grants live only in the territory Capital's `.ki.toml`, alongside the channels they ride on. Propose the change through the Capital's own change process; no member command adds or removes them.

```toml
[skills.ki-trades.territory.subtypes]
shared-capability-maintenance = "Maintenance evidence about receiver-owned shared capabilities."

[[skills.ki-trades.territory.standing]]
subtype = "shared-capability-maintenance"
from = ["https://github.com/owner/source"]
to = ["https://github.com/owner/receiver"]
```

Every grant must name a defined subtype, and every sender and receiver pair it names must also be covered by a knowledge channel. `ki` rejects the policy otherwise. Review the result from any member with `ki repo trade policy show`.

## Check the grant

Check either repository with `ki repo trade standing list` or select the exact relationship:

```bash
ki repo trade standing check https://github.com/owner/source \
  --direction import \
  --subtype shared-capability-maintenance
```

A grant is `active` exactly when its ordinary knowledge route is active: the peer is registered once, declares `[skills.ki-trades]` and names the same Capital. Otherwise it reports the same awaiting, pending or ambiguous state as the route. `--incomplete` limits `ki repo trade standing list` to inactive grants.

## Capture committed source evidence

Choose an existing Markdown file in the receiver and an anchor describing where the retained knowledge belongs. From the receiver, run:

```bash
ki repo trade standing capture https://github.com/owner/source \
  --subtype shared-capability-maintenance \
  --source-ref 0123456789abcdef0123456789abcdef01234567:docs/source.md#finding \
  --capture docs/roadmap/RECEIVER-GOV-001.md#source-analysis
```

The command first re-checks the active grant and resolves the commit and source path in the locally registered source checkout. It then appends a marked `ki-trades/standing-intake/v1` TOML block to the named receiver file. The block records a unique `STI-*` identity, UTC capture time, source and receiver identities, exact source reference, subtype, and capture location.

The operation changes only the current receiver repository. Review and commit the receiver file normally. Withdrawing the grant from the Capital later blocks new captures but does not erase previously committed provenance.

## Use an itemized trade when standing authority does not fit

Standing intake is knowledge-only and intentionally narrow. Use `ki repo trade prepare <repository> --kind knowledge ...` when the insight does not match an active grant, needs receiver review before retention, introduces a distinct decision or work scope, or cannot be pinned to the required source evidence. A standing grant never grants roadmap priority, implementation, publication, acceptance, completion, Territory, or peer-write authority.

## Withdraw the grant

Remove the `[[skills.ki-trades.territory.standing]]` entry from the Capital's `.ki.toml`, then remove its subtype once no other grant names it. No member repository changes, and previously committed provenance remains local evidence.
