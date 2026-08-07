---
id: TRD-aacc8a12
title: 'Reduce repetition in the repository configuration contract'
created_at: 2026-08-07T06:26:12Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: '.ki-config.toml'
observation: decision
---

# TRD-aacc8a12: Reduce repetition in the repository configuration contract

## Context

The `.ki-config.toml` contract requires every skill declaration to be a fully qualified `<harness-id>:<skill-name>` quoted TOML table. In this repository the prefix `knowledgeislands/ki-agentic-harness:` repeats sixteen times across 1687 bytes, so roughly a third of the file is one repeated string; the Harness's own configuration repeats it more often still. Nested configuration compounds the cost, because `["knowledgeislands/ki-agentic-harness:ki-roadmap".themes]` spends fifty-six characters to name roadmap themes, in the quoted-key and dotted-key combination that is the least familiar corner of TOML syntax. Because a qualified identity contains a colon and a slash, neither of which TOML permits in a bare key, every declaration must be a quoted key, although the TOML specification advises using bare keys except where quoting is necessary. The format also makes declaring a skill and configuring it the same act, so an intentionally empty table cannot be told apart from an abandoned stub, and it offers no structural distinction between a skill table and a repository-level setting that belongs to no skill; tools-ki resolves that ambiguity by treating any top-level key beginning `ki-` or containing a colon as a declaration, which is a consumer's reading rather than a property of the format. One consequence is already live in this repository: `ki-trades` has no root table and is declared only implicitly by its `.exports_to` and `.imports_from` sub-tables, so its declaration is a side effect of configuring it, and deleting those sub-tables would silently undeclare the skill rather than leaving it declared and unconfigured.

## Submission

Consider a revised layout that declares harness resolution once for the repository and names skills under a `[skills.<name>]` namespace, so the common single-harness case carries no repetition: a `[repo]` table holding `harnesses` as a list, bare `[skills.ki-repo]` tables resolved against that list, and nested configuration reached as `[skills.ki-roadmap.themes]`. A skill drawn from a harness outside the declared list keeps a fully qualified quoted key, so the exceptional case stays visibly exceptional rather than requiring a reserved key inside every skill's configuration namespace. Resolving a bare name against the declared list should bind exactly one provider, report that no declared harness provides the skill when there is none, and require explicit qualification when more than one does. That last rule is not new machinery: `resolveInstalledSkill` in tools-ki already reports that a skill is provided by multiple installed harnesses, and the existing contract already guarantees that a skill name is unique per repository regardless of provider. Resolution should use the declared list rather than whichever harnesses happen to be installed, so that a version-controlled file means the same thing on every machine. The layout also moves the ordinary case onto bare keys, which is what the TOML specification recommends, and leaves quoting for the cases where it is genuinely required.

This is how this repository's configuration reads today, abridged to the parts that carry the argument:

```toml
["knowledgeislands/ki-agentic-harness:ki-repo"]
repository = "https://github.com/knowledgeislands/tools-ki"
title = "tools-ki"
repo_code = "KI-TOOL"

["knowledgeislands/ki-agentic-harness:ki-authoring"]

["knowledgeislands/ki-agentic-harness:ki-engineering"]

["knowledgeislands/ki-agentic-harness:ki-roadmap"]
["knowledgeislands/ki-agentic-harness:ki-roadmap".themes]
CLI = "cli"
VENDOR = "cross-repository-vendoring"

["knowledgeislands/ki-agentic-harness:ki-trades".exports_to]
work = ["https://github.com/knowledgeislands/ki-agentic-harness", "https://github.com/knowledgeislands/ki-website", "https://github.com/knowledgeislands/tools-mgit", "https://github.com/krisb/dotfiles"]
knowledge = ["https://github.com/knowledgeislands/ki-agentic-harness", "https://github.com/knowledgeislands/ki-website", "https://github.com/krisb/dotfiles"]

["knowledgeislands/ki-agentic-harness:ki-trades".imports_from]
work = ["https://github.com/knowledgeislands/ki-agentic-harness", "https://github.com/knowledgeislands/tools-mgit"]
knowledge = []
```

This is the same configuration under the proposed layout:

```toml
[repo]
harnesses = ["knowledgeislands/ki-agentic-harness"]

[skills.ki-repo]
repository = "https://github.com/knowledgeislands/tools-ki"
title = "tools-ki"
repo_code = "KI-TOOL"

[skills.ki-authoring]
[skills.ki-engineering]

[skills.ki-roadmap]
[skills.ki-roadmap.themes]
CLI = "cli"
VENDOR = "cross-repository-vendoring"

[skills.ki-trades]
[skills.ki-trades.routes]
"https://github.com/knowledgeislands/ki-agentic-harness" = { export = ["work", "knowledge"], import = ["work"] }
"https://github.com/knowledgeislands/ki-website" = { export = ["work", "knowledge"] }
"https://github.com/knowledgeislands/tools-mgit" = { export = ["work"], import = ["work"] }
"https://github.com/krisb/dotfiles" = { export = ["work", "knowledge"] }
```

A skill drawn from a harness outside the declared list would sit alongside those as `[skills."acme/house-harness:ki-custom"]`, quoted because it must be. Declaring `[skills.ki-roadmap]` before `[skills.ki-roadmap.themes]` is optional under the specification, which creates the super-table implicitly and permits it to be declared before or after its sub-table; stating it explicitly is a convention that keeps a skill's declaration independent of whether it happens to carry configuration.

The same repetition appears inside the trade route declaration, which keys routes first by direction and then by kind, so a partner repository is named once for every kind and direction it participates in. In this repository four distinct partners occupy nine URL entries spread across `exports_to.work`, `exports_to.knowledge`, `imports_from.work`, and `imports_from.knowledge`. Keying routes by the partner repository instead would name each partner once and carry its kinds as arrays, so that `[skills.ki-trades.routes]` holds one entry per partner of the form `"https://github.com/owner/name" = { export = ["work", "knowledge"], import = ["work"] }`. That makes the whole relationship with one repository readable on a single line rather than assembled by scanning four lists, lets the specification's own prohibition on defining a key twice reject a duplicated partner, in place of the hand-written uniqueness and lexical-ordering check a consumer currently applies to each list separately, removes the explicit empty array a direction needs when it carries no kinds, and shortens `exports_to` and `imports_from` to `export` and `import` because the preposition's object has become the key. A route declaration can afford to carry nothing but its kinds, because route state is computed from the peer's reciprocal declaration rather than stored in the file.

## Constraints

The Harness retains every decision on whether to change the contract, on key names and nesting, and on migration sequencing across the estate. This is an observation and a proposal, not an agreed design. One consumer cost belongs in the receiver's assessment: today a declaration's identity is read literally from the table header, and under a bare-name layout it can only be derived once resolution has bound a provider, so the parsed declaration and the resolved skill become distinct shapes. In tools-ki that reaches beyond configuration parsing into skill selection, capability status reporting, and the path that reconstructs a qualified identity when declaring a skill. The parser, skill declaration, and skill undeclaration all become simpler, so the cost is concentrated in identity derivation rather than spread across the consumer. No compatibility shim is assumed in either repository; an unmigrated file fails loudly today because a bare table name is already rejected as unqualified, which makes a single clean cutover safe.

Two questions about the route shape belong to the Harness rather than to this proposal. Trade records identify a repository as `owner/name` while route declarations use a canonical HTTPS URL, so keying routes by repository forces a deliberate choice between matching the record form and keeping the host inside the key; this proposal assumes the URL without arguing the point. Separately, an inline table suits the declaration while a route carries only its kinds, but the specification intends an inline table to occupy a single line, forbids newlines between its braces except where a value permits them, and strongly discourages breaking one across lines in favour of a standard table; a route that later gained a per-partner property would therefore have to convert to a nested table header whose key is a full URL, and whether to accept that later conversion or adopt the longer header immediately is the receiver's call.
