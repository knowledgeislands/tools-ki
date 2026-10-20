import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { currentBinding, HOOK_DIRECTORY } from '../repository/hooks.ts'
import { scrubbedGitEnvironment } from '../runtime/git.ts'
import { localRegistryPath, requiredLocalRegistry } from '../storage/local-registry.ts'
import { convergeLogDirectory } from './apply.ts'
import { git } from './git.ts'
import type { ConvergeAction, EstatePorts } from './model.ts'

export interface HookSweepItem {
  readonly key: string
  readonly path: string
  readonly state: 'bind' | 'bound' | 'keep' | 'skip'
  readonly actions: readonly ConvergeAction[]
  readonly notes: readonly string[]
}

export interface HookSweepPlan {
  /** The registry the sweep planned from, recorded as the converge log's manifest. */
  readonly registry: string
  readonly items: readonly HookSweepItem[]
}

const PRE_COMMIT = `${HOOK_DIRECTORY}/pre-commit`

const kind = async (path: string): Promise<'directory' | 'file' | undefined> => {
  const state = await lstat(path).catch(() => undefined)
  return state?.isDirectory() ? 'directory' : state?.isFile() ? 'file' : undefined
}

/** Linked worktrees whose own configuration sets `core.hooksPath`, which the sweep reports and leaves. */
const worktreeOverrides = async (ports: EstatePorts, root: string): Promise<readonly string[]> => {
  const enabled = await git(ports, root, ['config', '--bool', '--get', 'extensions.worktreeConfig'])
  if (enabled.output.trim() !== 'true') return []
  const listing = await git(ports, root, ['worktree', 'list', '--porcelain'])
  const linked = listing.output
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .slice(1)
  const notes: string[] = []
  for (const worktree of linked) {
    const value = await git(ports, worktree, ['config', '--worktree', '--get', 'core.hooksPath'])
    if (value.exitCode === 0)
      notes.push(`worktree ${worktree} sets core.hooksPath=${value.output.trim()}; left as it is`)
  }
  return notes
}

/**
 * Plans the estate hook binding sweep from the local registry: every registered KI checkout with a
 * tracked `.githooks/pre-commit` is bound by the rule `ki repo conform` applies, and a `.husky/`
 * holding nothing tracked is set aside under the converge state folder, never deleted.
 */
export const planHookSweep = async (ports: EstatePorts): Promise<HookSweepPlan> => {
  const registry = await requiredLocalRegistry(ports.stateDirectory)
  const stamp = new Date(ports.now()).toISOString().replace(/[:.]/g, '-')
  const items: HookSweepItem[] = []
  for (const entry of [...registry].sort((left, right) => left.path.localeCompare(right.path))) {
    const root = entry.path
    if ((await kind(join(root, '.git'))) !== 'directory') {
      items.push({ key: entry.key, path: root, state: 'skip', actions: [], notes: ['not a primary checkout'] })
      continue
    }
    if ((await kind(join(root, REPOSITORY_DECLARATION_FILE))) !== 'file') continue
    if ((await git(ports, root, ['ls-files', '--error-unmatch', '--', PRE_COMMIT])).exitCode !== 0) continue
    const binding = await currentBinding(root, ports.runner, scrubbedGitEnvironment(ports.environment))
    const notes = [...(await worktreeOverrides(ports, root))]
    if (binding?.kind === 'keep') {
      notes.unshift(`core.hooksPath=${binding.value} is not .githooks; left as it is`)
      items.push({ key: entry.key, path: root, state: 'keep', actions: [], notes })
      continue
    }
    const actions: ConvergeAction[] = binding
      ? [{ kind: 'hooks-path', path: root, ...(binding.from ? { from: binding.from } : {}), to: HOOK_DIRECTORY }]
      : []
    const husky = join(root, '.husky')
    if ((await kind(husky)) === 'directory' && !(await git(ports, root, ['ls-files', '--', '.husky'])).output.trim())
      actions.push({
        kind: 'set-aside',
        from: husky,
        to: join(convergeLogDirectory(ports), 'set-aside', stamp, `${root.replace(/[^a-zA-Z0-9]/g, '-')}.husky`)
      })
    items.push({ key: entry.key, path: root, state: binding ? 'bind' : 'bound', actions, notes })
  }
  return { registry: localRegistryPath(ports.stateDirectory), items }
}
