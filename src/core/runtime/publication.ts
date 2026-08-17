import { renderRepositoryConformCommand, runRepositoryConformCommands } from '../repository/index.ts'
import { prepareScopedWrites, prepareWrites, publishWrites } from '../transaction.ts'
import type { Finding, PreparedSkill, SkillConformResult } from './index.ts'

/** A skill's complete conform proposal, retained with its audit evidence. */
export interface ConformedSkill {
  readonly prepared: PreparedSkill
  readonly conform: SkillConformResult
}

/** A dependency- and target-closed set of conform proposals that must move together. */
export interface ConformPublicationGroup {
  readonly entries: readonly ConformedSkill[]
  readonly blockingFinding?: { readonly skill: string; readonly finding: Finding }
}

export interface IndependentPublicationOptions {
  readonly repository: string
  readonly userHome: string
  readonly dryRun: boolean
  readonly allowCommands: boolean
  readonly write: (value: string) => void
}

const find = (parents: number[], index: number): number => {
  const parent = parents[index]
  // An index in range always has a parent; the fallback only protects future callers.
  /* v8 ignore next */
  if (parent === undefined) return index
  if (parent === index) return index
  const root = find(parents, parent)
  parents[index] = root
  return root
}

const unite = (parents: number[], left: number, right: number): void => {
  const leftRoot = find(parents, left)
  const rightRoot = find(parents, right)
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
}

const proposalTargets = (entry: ConformedSkill): readonly string[] =>
  entry.conform.writes.map(({ path }) => `${entry.conform.scope.kind}:${path}`)

const firstFailure = (entry: ConformedSkill): Finding | undefined =>
  entry.conform.findings.find(({ level }) => level === 'fail')

/**
 * Builds the smallest safe publication groups. A declared dependency and a shared target
 * both join proposals: either relationship means publishing one side alone would invalidate
 * its audit evidence or split one filesystem transaction.
 */
export const groupConformPublication = (entries: readonly ConformedSkill[]): readonly ConformPublicationGroup[] => {
  const parents = entries.map((_, index) => index)
  const byName = new Map(entries.map((entry, index) => [entry.prepared.skill.declaration.name, index]))
  const byTarget = new Map<string, number>()
  entries.forEach((entry, index) => {
    for (const dependency of entry.prepared.skill.capability.dependsOn) {
      const dependencyIndex = byName.get(dependency)
      // Skill resolution includes every declared dependency before conform begins.
      /* v8 ignore next */
      if (dependencyIndex !== undefined) unite(parents, index, dependencyIndex)
    }
    for (const target of proposalTargets(entry)) {
      const owner = byTarget.get(target)
      if (owner === undefined) byTarget.set(target, index)
      else unite(parents, index, owner)
    }
  })
  const grouped = new Map<number, ConformedSkill[]>()
  entries.forEach((entry, index) => {
    const root = find(parents, index)
    const group = grouped.get(root)
    if (group) group.push(entry)
    else grouped.set(root, [entry])
  })
  return [...grouped.values()].map((group) => {
    const failed = group
      .map((entry) => ({ skill: entry.prepared.skill.identity, finding: firstFailure(entry) }))
      .find(({ finding }) => finding !== undefined)
    return failed?.finding
      ? { entries: group, blockingFinding: { skill: failed.skill, finding: failed.finding } }
      : { entries: group }
  })
}

/** Publishes only groups that remain safe after unrelated initial audit failures. */
export const publishIndependentConformGroups = async (
  entries: readonly ConformedSkill[],
  { repository, userHome, dryRun, allowCommands, write }: IndependentPublicationOptions
): Promise<boolean> => {
  let published = false
  for (const group of groupConformPublication(entries)) {
    const label = group.entries.map(({ prepared }) => prepared.skill.identity).join(', ')
    const groupWrites = group.entries.flatMap(({ conform }) => conform.writes)
    const groupCommands = group.entries.flatMap(({ conform }) => conform.commands)
    if (!groupWrites.length && !groupCommands.length) continue
    for (const proposal of groupWrites) write(`proposed write ${proposal.path}\n`)
    for (const command of groupCommands) write(`proposed run ${renderRepositoryConformCommand(command)}\n`)
    if (group.blockingFinding) {
      const { skill, finding } = group.blockingFinding
      write(`withheld ${label}: blocking ${skill} [${finding.title} (${finding.code})] — ${finding.message}\n`)
      continue
    }
    if (group.entries.some(({ conform }) => conform.scope.kind === 'user-home' && conform.commands.length)) {
      write(
        `refused ${label}: user-home rubric conform actions must be guarded direct writes; conform commands are not permitted\n`
      )
      continue
    }
    if (groupCommands.length && !allowCommands) {
      write(
        `withheld ${label}: command-backed conform repairs require --allow-commands while failures are unresolved\n`
      )
      continue
    }
    try {
      const repositoryWrites = await prepareWrites(
        repository,
        group.entries
          .filter(({ conform }) => conform.scope.kind === 'repository')
          .flatMap(({ conform }) => conform.writes)
      )
      const scopedUserWrites = group.entries.flatMap(({ conform }) => {
        const scope = conform.scope
        if (scope.kind !== 'user-home') return []
        return conform.writes.map((proposal) => ({ write: proposal, scope: { paths: scope.paths } }))
      })
      const userWrites = await prepareScopedWrites(userHome, scopedUserWrites)
      const writes = [...repositoryWrites, ...userWrites]
      await publishWrites(writes, dryRun)
      for (const proposal of writes) write(`${dryRun ? 'would apply' : 'applied'} write ${proposal.path}\n`)
      published ||= writes.length > 0
    } catch (error) {
      write(`refused ${label}: ${(error as Error).message}\n`)
      continue
    }
    if (groupCommands.length && dryRun) {
      for (const command of groupCommands) write(`would run guarded ${renderRepositoryConformCommand(command)}\n`)
      continue
    }
    if (groupCommands.length) {
      for (const command of groupCommands) write(`run guarded ${renderRepositoryConformCommand(command)}\n`)
      try {
        await runRepositoryConformCommands(repository, groupCommands)
        published = true
      } catch (error) {
        write(`failed ${label}: ${(error as Error).message}\n`)
      }
    }
  }
  return published
}
