# Outgoing trades

This directory holds sender-owned cross-repository work and knowledge preparations and submitted trades, grouped by the receiver's canonical `owner/repo` identity. Mutable preparations live beneath `_PREPARATIONS/`; submission atomically moves one to the peer path and freezes it.

Only this repository writes or removes these records. A submitted trade's observation policy determines whether receipt, a terminal decision, or completion of adopted local work permits release.

An outbound record may await the receiver's `ki-trades` participation and matching import declaration. It remains sender-owned until an inbound copy is observable.
