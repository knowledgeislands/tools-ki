---
id: TRD-aacc8a12
title: "Reduce repetition in the repository configuration contract"
created_at: 2026-08-07T06:26:12Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: knowledge
source_ref: ".ki-config.toml"
observation: decision
phase: preparing
---
# TRD-aacc8a12: Reduce repetition in the repository configuration contract

## Context

The `.ki-config.toml` contract requires every skill declaration to be a fully qualified `<harness-id>:<skill-name>` quoted TOML table. In this repository the prefix `knowledgeislands/ki-agentic-harness:` repeats sixteen times across 1687 bytes, so roughly a third of the file is one repeated string; the Harness's own configuration repeats it more often still. Nested configuration compounds the cost, because `["knowledgeislands/ki-agentic-harness:ki-roadmap".themes]` spends fifty-six characters to name roadmap themes, in the quoted-key and dotted-key combination that is the least familiar corner of TOML syntax. The format also makes declaring a skill and configuring it the same act, so an intentionally empty table cannot be told apart from an abandoned stub, and it leaves nowhere for repository-level settings that belong to no skill, because any top-level key beginning `ki-` or containing a colon is read as a skill declaration. One consequence is already live in this repository: `ki-trades` has no root table and is declared only implicitly by its `.exports_to` and `.imports_from` sub-tables, so adding the apparently missing header is a duplicate-table error while deleting the sub-tables silently undeclares the skill.

## Submission

Consider a revised layout that declares harness resolution once for the repository and names skills under a `[skills.<name>]` namespace, so the common single-harness case carries no repetition: a `[repo]` table holding `harnesses` as a list, bare `[skills.ki-repo]` tables resolved against that list, and nested configuration reached as `[skills.ki-roadmap.themes]`. A skill drawn from a harness outside the declared list keeps a fully qualified quoted key, so the exceptional case stays visibly exceptional rather than requiring a reserved key inside every skill's configuration namespace. Resolving a bare name against the declared list should bind exactly one provider, report that no declared harness provides the skill when there is none, and require explicit qualification when more than one does. That last rule is not new machinery: `resolveInstalledSkill` in tools-ki already reports that a skill is provided by multiple installed harnesses, and the existing contract already guarantees that a skill name is unique per repository regardless of provider. Resolution should use the declared list rather than whichever harnesses happen to be installed, so that a version-controlled file means the same thing on every machine.

## Constraints

The Harness retains every decision on whether to change the contract, on key names and nesting, and on migration sequencing across the estate. This is an observation and a proposal, not an agreed design. One consumer cost belongs in the receiver's assessment: today a declaration's identity is read literally from the table header, and under a bare-name layout it can only be derived once resolution has bound a provider, so the parsed declaration and the resolved skill become distinct shapes. In tools-ki that reaches beyond configuration parsing into skill selection, capability status reporting, and the path that reconstructs a qualified identity when declaring a skill. The parser, skill declaration, and skill undeclaration all become simpler, so the cost is concentrated in identity derivation rather than spread across the consumer. No compatibility shim is assumed in either repository; an unmigrated file fails loudly today because a bare table name is already rejected as unqualified, which makes a single clean cutover safe.
