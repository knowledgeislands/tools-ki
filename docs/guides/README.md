# tools-ki guides

Practical instructions for `tools-ki`. Decision Records explain why the platform is shaped as it is, Specifications define what it does, and these guides explain how to do something with it.

Choose your audience first.

- **[User guides](user/README.md)** — you are using `ki` against repositories. Installation and first run, capabilities and skills, repository audit and conform, keeping an installation healthy, and the bounded acquisition and exchange workflows.
- **[Developer guides](developer/README.md)** — you are changing `ki` itself. Local development against a checkout, the delivery boundary for a completed change, and release publication.

New to `ki` entirely? Start at [install ki and run it for the first time](user/getting-started.md).

## What a guide is authoritative for

A guide owns the **procedure**: the order of steps, their preconditions, what to check afterwards, and how to recover when something fails.

`ki --help` and the installed `man ki` manual own the **grammar**: exact invocations, option names, and arguments. Guides deliberately do not restate option lists, which keeps them from drifting out of step with the executable. Where a guide and the manual appear to disagree about grammar, the manual is correct and the guide needs fixing.

The repository Specifications own the **behaviour**. Where a guide and a specification disagree about what the CLI does, the specification is correct and the guide needs fixing.

## Write for the reader

Open each guide by saying what its reader will be able to accomplish. Make every link label describe the fact or destination it names; a link may support a complete explanation, but its label must not stand in for content the guide owes.
