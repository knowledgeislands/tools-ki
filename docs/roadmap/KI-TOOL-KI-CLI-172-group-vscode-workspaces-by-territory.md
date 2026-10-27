---
id: KI-TOOL-KI-CLI-172
area: CLI
title: Group VS Code workspaces
component: manage
priority: medium
size: m
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-27T03:48:28Z
updated_at: 2026-10-27T03:48:28Z
---

# KI-TOOL-KI-CLI-172: Group VS Code workspaces

## Goal

The VS Code workspace generator maintains one current `kis-<repository-name>.code-workspace` per existing registered repository under `~/workspaces/vscode/<territory-directory>/`, grouped natively by territory, and safely prunes generated workspaces whose repositories no longer exist.

## Context

Kris requested this on 27 October 2026 at 03:41 GMT: regenerate every workspace, retain only current projects, organise them by territory, and capture native tool support if manual grouping was necessary.

`ki vscode sync --write` currently reconciles chezmoi source `workspaces/vscode/*.code-workspace`; it does not write live targets or traverse territory subfolders. `src/core/manage/vscode.ts` derives `kis-<repository-name>.code-workspace`, preserves custom settings, and prunes nonexistent folder roots, deleting a formerly nonempty workspace only when none remain. Repositories with no local checkout are skipped. `src/core/territory/targets/vscode.ts` can already resolve absolute or relative workspace folder roots when inspecting an explicit file.

On terra, Personal > Rig > terra (personal.regular.rig-terra) ran `ki vscode sync --write`, then manually moved 61 current source workspaces and their live counterparts into eight territory-directory subfolders: `equal-remedy` (3), `humans-not-robots` (17), `knowledge-islands` (20), `legal` (2), `personal` (10), `sacred-inquiry` (2), `techmedix` (3) and `valle-armonia` (4). Dotfiles belongs to `personal`, via its estate member path. Every workspace used absolute folder paths; source-store roots and settings were preserved. No stale workspace files remained to delete. The obsolete registry entry for `mcp-ki-kb-notion-mirror` had no checkout and received no workspace. The former flat target paths were explicitly added to chezmoi's removal ledger for reviewed cleanup on other machines.

## Boundary

In: native territory grouping in source reconciliation, recursive discovery of grouped workspaces, migration of existing flat generated files, one generated workspace per current repository, explicit safe pruning of retired generated workspaces, idempotence, preview/write agreement, documentation and CLI contract tests. Use territory directory names consistently and resolve territory membership from declared Capitals and manifests; handle the dotfiles checkout outside `~/workspaces` through its declared membership.

Out: applying chezmoi, changing editor state, registry cleanup, inventing source stores, deleting `.DS_Store`, deleting unrelated files or work records, and automatically deleting customised, external or intentionally empty workspaces without a reviewed ownership policy.

## Discussion

The immediate manual layout meets Kris's request, but the current flat-only reader would recreate flat duplicates on the next sync and could overlook grouped custom settings. Native support must read existing grouped files before planning writes and preserve settings, source-store roots and trusted-client scopes. Keep the current `kis-` names within each territory; define collision and ambiguous-membership behaviour explicitly rather than guessing from a repository basename.

Pruning must distinguish generated files owned by a retired repository from user-authored workspaces. Preview each exact removal and restrict writes to the confirmed plan; do not infer that every unfamiliar filename is stale. Decide how to handle a retained external source-store root when its repository disappears, and how to migrate relative folder entries without changing their resolved roots. Regeneration should be idempotent after grouping and should never leave both flat and grouped copies.

## Dependencies / blocks

No build-order dependencies. Planning must settle membership resolution for repositories outside the estate root, ownership evidence for pruning, preservation of custom workspaces, and the migration contract. This intake record does not authorise implementation or adoption.
