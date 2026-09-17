# AGENTS.md — tools-ki

`tools-ki` is the runtime-neutral command host for Knowledge Islands. The [README](README.md) is the user-facing entry point; this file keeps only the standing contribution context that must be loaded for every task.

## Governing sources

- Use the repository-local `ki-self` skill for changes to CLI architecture, command/core boundaries, bootstrap or Harness resolution, native operations, contract testing, coverage evidence, or human-facing output. Its [product-engineering standard](.agents/skills/ki-self/references/standards-product-engineering.md) is the source of truth for tools-ki-specific expectations.
- Use the declared portable skills for concerns they own: `ki-engineering` for TypeScript/Bun design and toolchain, `ki-authoring` for Markdown and TOML presentation, `ki-repo-tools` for executable distribution and release readiness, `ki-git` for shared-tree commits, `ki-repo` for repository and cross-repository authority, and `ki-trades` for trade semantics. Do not restate those standards here.
- Compatible Harnesses own reusable skill semantics; KI Specifications owns portable normative contracts; `tools-ki` owns the public `ki` executable, native-operation host, installation, resolution, and projections.

## Working contract

- Preserve unrelated dirty work and treat the checkout as potentially shared. Re-check `HEAD`, status, staged paths, and verification evidence before each commit; stage only explicitly owned paths and never push without instruction.
- Exercise behaviour through the public in-process CLI seam `run(args, context)` and the `sandbox()` helper. Inject streams, paths, time, and network through `KiContext`; tests do not contact the network.
- Keep command modules responsible for grammar, validation, and rendering, and core modules responsible for typed domain behaviour and repository effects. Do not add legacy aliases or compatibility paths unless a transition is explicitly authorised.
- Commit only complete, verified units. If a review identifies material work outside the authorised pass, present the finding and route before creating or implementing follow-up work.
