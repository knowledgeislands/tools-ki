import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'

const CONNECTOR_ID = 'knowledgeislands.chatgpt.local-capture'
const CONNECTOR_VERSION = '0.1.0'

interface CaptureMetadata {
  readonly boundary: string
  readonly omissions: readonly string[]
}

interface Capture {
  readonly directory: string
  readonly originals: string
  readonly records: string
  readonly assets: string
  readonly relationships: string
  readonly metadata: CaptureMetadata
  readonly recordCount: number
  readonly assetCount: number
  readonly relationshipCount: number
}

interface Payload {
  readonly checksumLines: readonly string[]
  readonly packageId: string
  readonly payloadSha256: string
}

export interface ImportOptions {
  readonly output: string
  readonly dryRun?: boolean
}

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

const operationalError = (message: string): KiError => new KiError(message)

const isRegularFile = async (path: string): Promise<boolean> =>
  Boolean((await stat(path).catch(() => undefined))?.isFile())

const inspectPath = async (path: string, label: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state || state.isSymbolicLink()) throw operationalError(`${label} is required`)
}

const physicalDirectory = async (path: string, label: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state || state.isSymbolicLink() || !state.isDirectory())
    throw operationalError(`${label} must be an existing directory`)
  return realpath(path)
}

const isSafeRelativePath = (path: string): boolean => {
  if (path.startsWith('/') || path.includes('//')) return false
  const segments = path.split('/')
  return segments.every(
    (segment) => segment && segment !== '.' && segment !== '..' && /^[A-Za-z0-9._-]+$/.test(segment)
  )
}

const listFiles = async (directory: string, relativeDirectory = ''): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    const fullPath = join(directory, entry.name)
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
      throw operationalError('capture contains an unsafe file')
    if (entry.isDirectory()) paths.push(...(await listFiles(fullPath, relativePath)))
    if (entry.isFile()) paths.push(relativePath)
  }
  return paths.sort((left, right) => left.localeCompare(right, 'en'))
}

const parseMetadata = async (path: string): Promise<CaptureMetadata> => {
  await inspectPath(path, 'capture.toml')
  const values = new Map<string, string>()
  const boundaryPattern = /^[A-Za-z0-9][A-Za-z0-9 .,:;()/_-]*$/
  const omissionsPattern = /^\[("[A-Za-z0-9 .,:;()/_-]+"(,"[A-Za-z0-9 .,:;()/_-]+")*)?\]$/

  for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const match = /^(format|format_version|capture_boundary|omissions) = (.+)$/.exec(line)
    if (!match?.[1] || !match[2]) throw operationalError('capture metadata contains an unsupported field')
    const [, key, value] = match
    if (values.has(key)) throw operationalError(`capture metadata repeats ${key}`)
    values.set(key, value)
  }

  if (values.get('format') !== '"ki-chatgpt-capture"')
    throw operationalError('capture metadata format must be ki-chatgpt-capture')
  if (values.get('format_version') !== '"0.1.0"')
    throw operationalError('capture metadata format_version must be 0.1.0')
  const rawBoundary = values.get('capture_boundary')
  if (!rawBoundary?.startsWith('"') || !rawBoundary.endsWith('"') || !boundaryPattern.test(rawBoundary.slice(1, -1))) {
    throw operationalError('capture_boundary contains unsupported characters')
  }
  const omissions = values.get('omissions')
  if (!omissions || !omissionsPattern.test(omissions))
    throw operationalError('omissions must be a compact array of plain strings')

  return { boundary: rawBoundary.slice(1, -1), omissions: JSON.parse(omissions) as string[] }
}

const validateTree = async (directory: string, kind: 'originals' | 'records' | 'assets'): Promise<string[]> => {
  const files = await listFiles(directory)
  for (const path of files) {
    if (!isSafeRelativePath(path)) throw operationalError(`${kind} contains an unsafe path`)
    const fileState = await lstat(join(directory, path))
    /* v8 ignore next -- listFiles admits only regular, non-symlink entries; the recheck protects a TOCTOU race. */
    if (!fileState.isFile() || fileState.isSymbolicLink()) throw operationalError(`${kind} contains an unsafe file`)
    if (kind === 'records' && !path.endsWith('.md')) throw operationalError('records must use Markdown file names')
  }
  return files
}

const validateRelationships = async (path: string, records: string, assets: string): Promise<number> => {
  await inspectPath(path, 'relationships/native.jsonl')
  const text = await readFile(path, 'utf8')
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  const positions = new Set<string>()
  const duplicateLines = new Set<string>()
  const orderPattern =
    /^\{"type":"conversation-order","record":"records\/([A-Za-z0-9._/-]+)","position":([1-9][0-9]*)\}$/
  const assetPattern =
    /^\{"type":"message-asset","record":"records\/([A-Za-z0-9._/-]+)","asset":"assets\/([A-Za-z0-9._/-]+)","message_id":"([A-Za-z0-9._:-]+)"\}$/
  const projectPattern =
    /^\{"type":"project-conversation","record":"records\/([A-Za-z0-9._/-]+)","project_id":"([A-Za-z0-9._:-]+)"\}$/

  for (const line of lines) {
    if (!line) throw operationalError('relationships/native.jsonl contains a blank record')
    if (duplicateLines.has(line)) throw operationalError('relationships/native.jsonl contains a duplicate record')
    duplicateLines.add(line)
    const order = orderPattern.exec(line)
    const asset = assetPattern.exec(line)
    const project = projectPattern.exec(line)
    if (order?.[1] && order[2]) {
      if (!isSafeRelativePath(order[1])) throw operationalError('relationship record path is unsafe')
      if (!(await isRegularFile(join(records, order[1]))))
        throw operationalError('relationship references a missing record')
      if (positions.has(order[2])) throw operationalError('relationship repeats a conversation position')
      positions.add(order[2])
      continue
    }
    if (asset?.[1] && asset[2]) {
      if (!isSafeRelativePath(asset[1])) throw operationalError('relationship record path is unsafe')
      if (!isSafeRelativePath(asset[2])) throw operationalError('relationship asset path is unsafe')
      if (!(await isRegularFile(join(records, asset[1]))))
        throw operationalError('relationship references a missing record')
      if (!(await isRegularFile(join(assets, asset[2]))))
        throw operationalError('relationship references a missing asset')
      continue
    }
    if (project?.[1]) {
      if (!isSafeRelativePath(project[1])) throw operationalError('relationship record path is unsafe')
      if (!(await isRegularFile(join(records, project[1]))))
        throw operationalError('relationship references a missing record')
      continue
    }
    throw operationalError('relationship is not a supported source-native record')
  }
  return lines.length
}

const loadCapture = async (captureArgument: string): Promise<Capture> => {
  const directory = await physicalDirectory(captureArgument, 'capture-directory')
  const allowedEntries = new Set(['capture.toml', 'originals', 'records', 'assets', 'relationships'])
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!allowedEntries.has(entry.name))
      throw operationalError('capture-directory contains an unsupported top-level entry')
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
      throw operationalError('capture-directory contains an unsupported file type')
  }
  const originals = join(directory, 'originals')
  const records = join(directory, 'records')
  const assets = join(directory, 'assets')
  const relationshipsDirectory = join(directory, 'relationships')
  for (const [path, label] of [
    [originals, 'originals directory'],
    [records, 'records directory'],
    [assets, 'assets directory'],
    [relationshipsDirectory, 'relationships directory']
  ] as const) {
    const state = await lstat(path).catch(() => undefined)
    if (!state || state.isSymbolicLink() || !state.isDirectory()) throw operationalError(`${label} is required`)
  }
  const originalsFiles = await validateTree(originals, 'originals')
  if (!originalsFiles.length) throw operationalError('originals directory must contain at least one file')
  const recordsFiles = await validateTree(records, 'records')
  if (!recordsFiles.length) throw operationalError('records directory must contain at least one file')
  const assetFiles = await validateTree(assets, 'assets')
  const relationships = join(relationshipsDirectory, 'native.jsonl')
  return {
    directory,
    originals,
    records,
    assets,
    relationships,
    metadata: await parseMetadata(join(directory, 'capture.toml')),
    recordCount: recordsFiles.length,
    assetCount: assetFiles.length,
    relationshipCount: await validateRelationships(relationships, records, assets)
  }
}

const filesWithDigests = async (directory: string, prefix: string): Promise<string[]> => {
  const files = await listFiles(directory)
  return Promise.all(files.map(async (path) => `${digest(await readFile(join(directory, path)))}  ${prefix}/${path}`))
}

const normalisedRelationships = async (capture: Capture): Promise<string> =>
  (await readFile(capture.relationships, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((line) => line.replace('"record":"records/', '"record":"source/records/'))
    .join('\n')

const calculatePayload = async (capture: Capture): Promise<Payload> => {
  const relationships = await normalisedRelationships(capture)
  const checksumLines = [
    ...(await filesWithDigests(capture.assets, 'assets')),
    `${digest(`${relationships}\n`)}  relationships/native.jsonl`,
    ...(await filesWithDigests(capture.originals, 'source/originals')),
    ...(await filesWithDigests(capture.records, 'source/records'))
  ]
  const payloadSha256 = digest(`${checksumLines.join('\n')}\n`)
  return { checksumLines, payloadSha256, packageId: `kep:sha256:${payloadSha256}` }
}

const outputDirectory = async (captureDirectory: string, output: string): Promise<string> => {
  const state = await lstat(output).catch(() => undefined)
  if (state) throw operationalError('output directory already exists')
  const name = basename(output)
  if (!name || name === '.' || name === '..') throw operationalError('output directory name is invalid')
  const parent = await physicalDirectory(dirname(output), 'output parent directory')
  const destination = join(parent, name)
  if (destination === captureDirectory || destination.startsWith(`${captureDirectory}/`)) {
    throw operationalError('output directory must be outside capture-directory')
  }
  return destination
}

const writeKep = async (capture: Capture, payload: Payload, output: string): Promise<void> => {
  await mkdir(output)
  try {
    await mkdir(join(output, 'source'), { recursive: true })
    await Promise.all([
      cp(capture.originals, join(output, 'source/originals'), { recursive: true }),
      cp(capture.records, join(output, 'source/records'), { recursive: true }),
      cp(capture.assets, join(output, 'assets'), { recursive: true })
    ])
    await mkdir(join(output, 'relationships'), { recursive: true })
    await mkdir(join(output, 'checksums'), { recursive: true })
    await writeFile(join(output, 'relationships/native.jsonl'), `${await normalisedRelationships(capture)}\n`)
    await writeFile(join(output, 'checksums/sha256sums.txt'), `${payload.checksumLines.join('\n')}\n`)
    await writeFile(
      join(output, 'kep.toml'),
      [
        'format = "kep"',
        'format_version = "0.1.0"',
        `package_id = "${payload.packageId}"`,
        `payload_sha256 = "${payload.payloadSha256}"`,
        `omissions = ${JSON.stringify(capture.metadata.omissions)}`,
        'normalisations = []',
        'checksum_manifest = "checksums/sha256sums.txt"',
        '',
        '[connector]',
        `id = "${CONNECTOR_ID}"`,
        `version = "${CONNECTOR_VERSION}"`,
        'mode = "user-assisted"',
        '',
        '[source]',
        'system = "chatgpt"',
        `capture_boundary = "${capture.metadata.boundary}"`,
        '',
        '[inventory]',
        `records = ${capture.recordCount}`,
        `assets = ${capture.assetCount}`,
        `relationships = ${capture.relationshipCount}`,
        ''
      ].join('\n')
    )
  } catch (error) {
    await rm(output, { recursive: true, force: true })
    throw error
  }
}

const emitResult = (
  context: KiContext,
  capture: Capture,
  payload: Payload,
  output: string,
  options: ImportOptions
): void => {
  context.stdout.write(`${options.dryRun ? 'KEP plan' : 'KEP created'}: ${output}\n`)
  context.stdout.write(`Package: ${payload.packageId}\n`)
  context.stdout.write(
    `Inventory: ${capture.recordCount} records, ${capture.assetCount} assets, ${capture.relationshipCount} relationships\n`
  )
  context.stdout.write(`Omissions: ${JSON.stringify(capture.metadata.omissions)}\n`)
  context.stdout.write(
    'Limitations: local user-provided capture only; no browser, network, credentials, repository discovery, or knowledge extraction.\n'
  )
  if (options.dryRun) context.stdout.write('Dry run: no files written.\n')
}

export const importCapture = async (
  context: KiContext,
  captureArgument: string,
  options: ImportOptions
): Promise<void> => {
  const captureState = await lstat(captureArgument).catch(() => undefined)
  if (captureState?.isSymbolicLink()) throw operationalError('capture-directory must not be a symbolic link')
  const captureDirectory = await physicalDirectory(captureArgument, 'capture-directory')
  const output = await outputDirectory(captureDirectory, options.output)
  const capture = await loadCapture(captureArgument)
  const payload = await calculatePayload(capture)
  if (!options.dryRun) await writeKep(capture, payload, output)
  emitResult(context, capture, payload, output, options)
}
