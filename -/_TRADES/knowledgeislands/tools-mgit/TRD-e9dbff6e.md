---
id: TRD-e9dbff6e
title: "Consume canonical estate and stores"
created_at: 2026-08-05T20:09:54Z
sender: knowledgeislands/tools-ki
receiver: knowledgeislands/tools-mgit
kind: work
source_ref: "docs/roadmap/KI-TOOL-CLI-018-decouple-agora-editor-targets.md"
---
# TRD-e9dbff6e: Consume canonical estate and stores

## Context

tools-ki is defining a canonical system-managed Agora as the registered estate of KI repositories. Each member will carry a local repository-name key and canonical HTTPS identity. KB repositories will declare portable store roles through a proposed ki-repo contract; notes is self, while sources and legacy are optional local bindings.

## Submission

Assess and define how mGit should consume the canonical registered estate and repository-store references. Preserve mGit workspace-group authority while allowing tool workspace generation or selection to address canonical repository members by local key and expose declared notes, sources, and legacy stores. Identify the minimum portable contract and any mGit-specific local mapping needed; do not assume source or legacy stores are Git repositories.

## Constraints

tools-mgit owns its workspace manifest and CLI contract. Do not write tools-ki as part of this trade. Treat canonical HTTPS home as repository identity, local repository name as a user-facing key, and machine paths as local bindings. Await the KI Agentic Harness ki-repo kind and store-role contract proposed in TRD-d2cd35f7 before finalising shared semantics.
