---
id: TRD-d2cd35f7
title: "Define repository kind and stores"
created_at: 2026-08-05T19:04:07Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/ki-agentic-harness
kind: work
source_ref: "docs/roadmap/KI-TOOL-CLI-018-decouple-agora-editor-targets.md"
observation: decision
---
# TRD-d2cd35f7: Define repository kind and stores

## Context

tools-ki is normalizing Agora into the canonical registered KI repository estate. It needs portable repository metadata that distinguishes KB and non-KB structures and declares named KB store roles without embedding machine-specific paths.

## Submission

Extend the ki-repo contract with a declared repository kind or structure and validate that the repository declares the compatible supporting skill set. For KB repositories, define portable named store roles: notes is required and is always the canonical repository self-reference; sources and legacy are optional roles whose local bindings remain outside tracked repository configuration. Define identity and validation rules suitable for tools-ki and future mGit consumers.

## Constraints

ki-agentic-harness owns the portable ki-repo contract. Do not write tools-ki as part of this trade. Preserve the canonical HTTPS repository home as identity; local repository-name keys and machine paths belong to local integration. Do not make source or legacy stores canonical KI repositories solely because an editor target can open them.
