import { lstat, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import type { Runner } from '../runtime/runner.ts'
import { type LocalRegistryEntry, repositoryStoreDirectory, requiredLocalRegistry } from '../storage/index.ts'

const trustedClients = ['claude-desktop', 'chatgpt-codex', 'claude-code'] as const
const runtimeClients: Readonly<Record<string, (typeof trustedClients)[number]>> = {
  'claude-code': 'claude-code',
  'claude-desktop': 'claude-desktop',
  'chatgpt-codex': 'chatgpt-codex'
}

interface WorkspaceFolder {
  readonly path: string
}

interface WorkspaceDocument {
  readonly path: string
  readonly before: string
  readonly workspace: {
    folders: WorkspaceFolder[]
    readonly [key: string]: unknown
  }
}

interface SourceWrite {
  readonly path: string
  readonly before: string
  readonly after: string
}

export interface VscodeManagePort {
  readonly environment: NodeJS.ProcessEnv
  readonly stateDirectory: string
  readonly runner: Runner
  readonly stdout: { write: (text: string) => void }
  readonly stderr: { write: (text: string) => void }
}

export interface VscodeManageResult {
  readonly changed: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sourceRoot = async (port: VscodeManagePort): Promise<string> => {
  const result = await port.runner('chezmoi', ['source-path'], port.environment)
  if (result.exitCode !== 0) throw new KiError(`chezmoi source path unavailable: ${result.output.trim()}`, 1)
  const path = result.output.trim()
  if (!isAbsolute(path) || path.includes('\n')) throw new KiError('chezmoi source path must be one absolute path', 1)
  return path
}

const repositoryTrustClients = async (
  repositories: readonly LocalRegistryEntry[]
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const result = new Map<string, readonly string[]>()
  for (const repository of repositories) {
    const configurationPath = join(repository.path, '.ki.toml')
    let parsed: unknown
    try {
      parsed = parse(await readFile(configurationPath, 'utf8'))
    } catch {
      throw new KiError(`registered repository has invalid .ki.toml: ${repository.path}`, 1)
    }
    // smol-toml parses a document as a table; retain a defensive parser-boundary guard.
    /* v8 ignore next */
    const skills = isRecord(parsed) ? parsed['skills'] : undefined
    const repo = isRecord(skills) ? skills['ki-repo'] : undefined
    const runtimes = isRecord(repo) ? repo['supported_runtimes'] : undefined
    if (!Array.isArray(runtimes) || runtimes.some((runtime) => typeof runtime !== 'string')) {
      throw new KiError(`registered repository has invalid supported_runtimes declaration: ${repository.path}`, 1)
    }
    const granted = runtimes
      .map((runtime) => runtimeClients[runtime])
      .filter((runtime): runtime is (typeof trustedClients)[number] => runtime !== undefined)
      .sort((left, right) => left.localeCompare(right))
    if (!granted.length) {
      throw new KiError(`registered repository has no supported trusted runtime: ${repository.path}`, 1)
    }
    result.set(repository.path, granted)
    if (repository.stores?.sources) {
      const sources = await repositoryStoreDirectory('sources', repository.stores.sources)
      result.set(sources, granted)
    }
  }
  return result
}

const workspaceDocuments = async (directory: string): Promise<WorkspaceDocument[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const documents: WorkspaceDocument[] = []
  for (const file of entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.code-workspace'))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, file.name)
    const before = await readFile(path, 'utf8')
    let workspace: unknown
    try {
      workspace = JSON.parse(before)
    } catch (error) {
      throw new KiError(`invalid VS Code workspace ${path}: ${(error as Error).message}`, 1)
    }
    if (!isRecord(workspace) || !Array.isArray(workspace['folders'])) {
      throw new KiError(`VS Code workspace has no folders array: ${path}`, 1)
    }
    const folders = workspace['folders']
    if (
      folders.some((folder) => !isRecord(folder) || typeof folder['path'] !== 'string' || !isAbsolute(folder['path']))
    ) {
      throw new KiError(`VS Code workspace folder must be an absolute path: ${path}`, 1)
    }
    documents.push({
      path,
      before,
      workspace: { ...workspace, folders: folders as WorkspaceFolder[] }
    })
  }
  return documents
}

const workspaceFileName = (repository: string): string => {
  const name = basename(repository)
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(name)) {
    throw new KiError(`cannot derive a safe VS Code workspace name from ${repository}`, 1)
  }
  return `kis-${name}.code-workspace`
}

const validateTrustedFolders = async (port: VscodeManagePort, path: string): Promise<void> => {
  const template = '{{ include ".chezmoidata/trusted-folders.yaml" | fromYaml | toJson }}'
  const result = await port.runner('chezmoi', ['execute-template', template], port.environment)
  if (result.exitCode !== 0) throw new KiError(`invalid trusted-folder inventory ${path}: ${result.output.trim()}`, 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(result.output)
  } catch {
    throw new KiError(`invalid trusted-folder inventory ${path}: template did not produce JSON`, 1)
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['trustedFolders'])) {
    throw new KiError(`trusted-folder inventory has no trustedFolders array: ${path}`, 1)
  }
}

const renderTrustedFolders = (
  source: string,
  folders: ReadonlySet<string>,
  repositoryClients: ReadonlyMap<string, readonly string[]>
): string => {
  const marker = 'trustedFolders:'
  const position = source.indexOf(marker)
  if (position === -1) throw new KiError('trusted-folder source has no trustedFolders root key', 1)
  const entries = [...folders]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => `  - path: ${path}\n    clients: [${(repositoryClients.get(path) ?? trustedClients).join(', ')}]`)
  return `${source.slice(0, position)}${marker}\n${entries.join('\n')}\n`
}

const buildPlan = async (
  port: VscodeManagePort,
  root: string,
  repositories: readonly LocalRegistryEntry[]
): Promise<readonly SourceWrite[]> => {
  const workspaceDirectory = join(root, 'workspaces', 'vscode')
  const trustedFoldersPath = join(root, '.chezmoidata', 'trusted-folders.yaml')
  const documents = await workspaceDocuments(workspaceDirectory)
  const knownFolders = new Set(documents.flatMap(({ workspace }) => workspace.folders.map((folder) => folder.path)))
  const writes: SourceWrite[] = []
  const repositoryClients = await repositoryTrustClients(repositories)

  for (const repository of repositories) {
    let matching = documents.filter(({ workspace }) =>
      workspace.folders.some((folder) => folder.path === repository.path)
    )
    if (!matching.length) {
      const path = join(workspaceDirectory, workspaceFileName(repository.path))
      const state = await lstat(path).catch(() => undefined)
      if (state) throw new KiError(`workspace file exists but does not include its KI repository: ${path}`, 1)
      const document = { path, before: '', workspace: { folders: [{ path: repository.path }] } }
      documents.push(document)
      matching = [document]
      knownFolders.add(repository.path)
    }
    const source = repository.stores?.sources
    if (source) {
      await repositoryStoreDirectory('sources', source)
      for (const document of matching) {
        if (!document.workspace.folders.some((folder) => folder.path === source)) {
          document.workspace.folders.push({ path: source })
          knownFolders.add(source)
        }
      }
    }
  }

  for (const document of documents) {
    const after = `${JSON.stringify(document.workspace, null, 2)}\n`
    if (document.before !== after) writes.push({ path: document.path, before: document.before, after })
  }

  const trustedSource = await readFile(trustedFoldersPath, 'utf8')
  await validateTrustedFolders(port, trustedFoldersPath)
  writes.push({
    path: trustedFoldersPath,
    before: trustedSource,
    after: renderTrustedFolders(trustedSource, knownFolders, repositoryClients)
  })
  return writes.filter((write) => write.before !== write.after)
}

const diffLines = (text: string): readonly string[] => {
  if (!text) return []
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

const unifiedDiff = (write: SourceWrite): string => {
  const before = diffLines(write.before)
  const after = diffLines(write.after)
  return [
    `--- ${write.path}`,
    `+++ ${write.path} (synchronised)`,
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...before.map((line) => `-${line}`),
    ...after.map((line) => `+${line}`),
    ''
  ].join('\n')
}

const printPlan = (port: VscodeManagePort, writes: readonly SourceWrite[]): void => {
  for (const write of writes) port.stdout.write(unifiedDiff(write))
}

const writeAtomically = async (write: SourceWrite): Promise<void> => {
  const temporary = `${write.path}.ki-vscode-tmp`
  await writeFile(temporary, write.after, 'utf8')
  await rename(temporary, write.path)
}

export const reconcileVscode = async (port: VscodeManagePort, write: boolean): Promise<VscodeManageResult> => {
  const root = await sourceRoot(port)
  const repositories = await requiredLocalRegistry(port.stateDirectory)
  const writes = await buildPlan(port, root, repositories)
  if (!writes.length) {
    port.stdout.write('VS Code workspaces and trusted folders already match the KI registry.\n')
    return { changed: false }
  }
  printPlan(port, writes)
  if (!write) {
    port.stderr.write('drift: rerun as ki manage vscode sync --write after reviewing this source diff\n')
    return { changed: true }
  }
  for (const change of writes) await writeAtomically(change)
  port.stdout.write(`synchronised ${writes.length} source file(s); review chezmoi diff before applying.\n`)
  return { changed: true }
}
