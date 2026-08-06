import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readDeclaredSkills } from './configuration.ts'
import { KiError } from './errors.ts'

export interface StreamProposal {
  readonly identity: string
  readonly title: string
  readonly status: string
}

export interface StreamFocus {
  readonly name: string
  readonly proposals: readonly StreamProposal[]
}

export type RepositoryPlanningSource = { readonly kind: 'roadmap' } | { readonly kind: 'streams'; readonly focuses: readonly StreamFocus[] }

interface ProposalFields {
  readonly type?: string
  readonly title?: string
  readonly status?: string
  readonly [key: string]: string | undefined
}

const physicalDirectory = async (path: string, message: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(message, 2)
}

const physicalFile = async (path: string, message: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) throw new KiError(message, 2)
}

const frontmatter = (contents: string, path: string): ProposalFields => {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents)
  if (!match?.[1]) throw new KiError(`${path} must declare stream-proposal frontmatter`, 2)
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const entry = /^([a-z_]+): (.+)$/.exec(line)
    if (!entry?.[1] || entry[2] === undefined || Object.hasOwn(fields, entry[1])) throw new KiError(`${path} has invalid stream-proposal frontmatter`, 2)
    fields[entry[1]] = entry[2]
  }
  return fields
}

const readProposal = async (directory: string, focus: string, name: string): Promise<StreamProposal> => {
  const path = join(directory, name, `${name}.md`)
  await physicalFile(path, `Knowledge Base stream proposal ${focus}/${name} must be a regular file`)
  const fields = frontmatter(await readFile(path, 'utf8'), path)
  const { type, title, status } = fields
  if (type !== 'stream-proposal' || !title || !status)
    throw new KiError(`Knowledge Base stream proposal ${focus}/${name} must declare type, title, and status`, 2)
  return { identity: `${focus}/${name}`, title, status }
}

const readProposalIfPresent = async (directory: string, focus: string, name: string): Promise<StreamProposal | undefined> => {
  const entries = await readdir(join(directory, name))
  if (!entries.length) return undefined
  return readProposal(directory, focus, name)
}

const readStreams = async (repository: string): Promise<readonly StreamFocus[]> => {
  const directory = join(repository, 'Streams')
  await physicalDirectory(directory, `Knowledge Base repository ${repository} has no physical Streams directory`)
  await physicalFile(join(directory, 'Streams.md'), `Knowledge Base repository ${repository} has no physical Streams/Streams.md file`)
  const entries = await readdir(directory, { withFileTypes: true })
  const focuses = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const focusDirectory = join(directory, entry.name)
        await physicalFile(join(focusDirectory, `${entry.name}.md`), `Knowledge Base stream focus ${entry.name} must be a regular file`)
        const proposals = await readdir(focusDirectory, { withFileTypes: true })
        return {
          name: entry.name,
          proposals: await Promise.all(
            proposals
              .filter((proposal) => proposal.isDirectory() && !proposal.isSymbolicLink())
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((proposal) => readProposalIfPresent(focusDirectory, entry.name, proposal.name))
          ).then((items) => items.filter((item): item is StreamProposal => item !== undefined))
        }
      })
  )
  return focuses
}

export const readRepositoryPlanningSource = async (repository: string, configuration: string): Promise<RepositoryPlanningSource> => {
  const declarations = await readDeclaredSkills(configuration)
  const decisionRecords = declarations.find((declaration) => declaration.name === 'ki-decision-records')
  const { repo_type: repoType } = decisionRecords?.configuration ?? {}
  if (repoType !== 'kb') return { kind: 'roadmap' }
  return { kind: 'streams', focuses: await readStreams(repository) }
}
