import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { isSafeRelativePath } from '../../commands/acquire.ts'
import { type CommandResult, sandbox } from './_helper.ts'

const mkfifo = promisify(execFile)

const writeFailure = vi.hoisted(() => ({ enabled: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    writeFile: (...arguments_: Parameters<typeof original.writeFile>) => {
      if (writeFailure.enabled && String(arguments_[0]).endsWith('/kep.toml')) return Promise.reject(new Error('write failure'))
      return original.writeFile(...arguments_)
    }
  }
})

afterEach(() => {
  writeFailure.enabled = false
})

const makeCapture = async (root: string): Promise<string> => {
  const capture = join(root, 'capture')
  await Promise.all(
    ['originals', 'records', 'assets', 'relationships'].map((directory) => mkdir(join(capture, directory), { recursive: true }))
  )
  await writeFile(
    join(capture, 'capture.toml'),
    [
      'format = "ki-chatgpt-capture"',
      'format_version = "0.1.0"',
      'capture_boundary = "One exported conversation: cli-002"',
      'omissions = ["No project membership was available"]',
      ''
    ].join('\n')
  )
  await writeFile(join(capture, 'originals/export.json'), '{"conversation_id":"cli-002"}\n')
  await writeFile(join(capture, 'records/conversation.md'), '# CLI-002 conversation\n\nuser: Please preserve this source record.\n')
  await writeFile(join(capture, 'assets/example.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await writeFile(
    join(capture, 'relationships/native.jsonl'),
    [
      '{"type":"conversation-order","record":"records/conversation.md","position":1}',
      '{"type":"message-asset","record":"records/conversation.md","asset":"assets/example.png","message_id":"message-001"}',
      ''
    ].join('\n')
  )
  return capture
}

describe('source path safety', () => {
  test('keeps source path validation strict for direct consumers', () => {
    expect(isSafeRelativePath('')).toBe(false)
    expect(isSafeRelativePath('/absolute')).toBe(false)
    expect(isSafeRelativePath('nested//path')).toBe(false)
    expect(isSafeRelativePath('nested/../path')).toBe(false)
    expect(isSafeRelativePath('nested/file.txt')).toBe(true)
  })
})

describe('ki acquire chatgpt import', () => {
  test('creates a deterministic KEP that conforms to the KIS-0002 payload layout', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const first = join(box.root.path, 'first.kep')
    const second = join(box.root.path, 'second.kep')

    expect((await box.run(['acquire', 'chatgpt', 'import', capture, '--output', first])).exitCode).toBe(0)
    expect((await box.run(['acquire', 'chatgpt', 'import', capture, '--output', second])).exitCode).toBe(0)

    const checksums = await readFile(join(first, 'checksums/sha256sums.txt'), 'utf8')
    expect(checksums).toBe(await readFile(join(second, 'checksums/sha256sums.txt'), 'utf8'))

    const checksumLines = checksums.trimEnd().split('\n')
    const paths = checksumLines.map((line) => line.slice(66))
    expect(paths).toEqual([...paths].sort((left, right) => left.localeCompare(right, 'en')))
    expect(new Set(paths).size).toBe(paths.length)
    for (const line of checksumLines) {
      const [digest, path] = [line.slice(0, 64), line.slice(66)]
      expect(digest).toMatch(/^[a-f0-9]{64}$/)
      expect(createHash('sha256').update(await readFile(join(first, path))).digest('hex')).toBe(digest)
    }

    const kepToml = await readFile(join(first, 'kep.toml'), 'utf8')
    const payloadSha256 = createHash('sha256').update(checksums).digest('hex')
    expect(kepToml).toContain('format = "kep"')
    expect(kepToml).toContain('checksum_manifest = "checksums/sha256sums.txt"')
    expect(kepToml).toContain(`payload_sha256 = "${payloadSha256}"`)
    expect(kepToml).toContain(`package_id = "kep:sha256:${payloadSha256}"`)
    expect(kepToml).toContain('records = 1')
    expect(kepToml).toContain('assets = 1')
    expect(kepToml).toContain('relationships = 2')
  })

  test('reports a dry run without writing and a versioned JSON result', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'dry-run.kep')
    const result = await box.run(['acquire', 'chatgpt', 'import', capture, '--output', output, '--dry-run', '--json'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('"status":"dry-run"')
    expect(result.output).toContain('"limitations"')
    expect(
      await lstat(output)
        .then(() => true)
        .catch(() => false)
    ).toBe(false)
  })

  test('rejects malformed input, missing relationship assets, and conflicting output before publication', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'existing.kep')
    await writeFile(
      join(capture, 'relationships/native.jsonl'),
      '{"type":"message-asset","record":"records/conversation.md","asset":"assets/missing.png","message_id":"message-002"}\n'
    )
    const missingAsset = await box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])
    expect(missingAsset.exitCode).toBe(1)
    expect(missingAsset.output).toContain('missing asset')

    await mkdir(output)
    const conflicting = await box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])
    expect(conflicting.exitCode).toBe(1)
    expect(conflicting.output).toContain('already exists')
  })

  test('rejects malformed metadata and unsafe capture trees', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])

    await writeFile(join(capture, 'capture.toml'), 'format = "wrong"\n')
    expect((await importCapture()).output).toContain('capture metadata format must be ki-chatgpt-capture')

    await writeFile(
      join(capture, 'capture.toml'),
      ['format = "ki-chatgpt-capture"', 'format_version = "0.1.0"', 'capture_boundary = "bad\\tboundary"', 'omissions = []', ''].join('\n')
    )
    expect((await importCapture()).output).toContain('capture_boundary contains unsupported characters')

    await writeFile(join(capture, 'records/not-markdown.txt'), 'not a record\n')
    expect((await importCapture()).output).toContain('records must use Markdown file names')
  })

  test('rejects metadata field, repetition, version and omissions violations', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])
    const metadata = (lines: readonly string[]): Promise<void> => writeFile(join(capture, 'capture.toml'), `${lines.join('\n')}\n`)

    await metadata(['unexpected = "field"'])
    expect((await importCapture()).output).toContain('capture metadata contains an unsupported field')
    await metadata(['format = "ki-chatgpt-capture"', 'format = "ki-chatgpt-capture"'])
    expect((await importCapture()).output).toContain('capture metadata repeats format')
    await metadata(['format = "ki-chatgpt-capture"', 'format_version = "0.2.0"'])
    expect((await importCapture()).output).toContain('capture metadata format_version must be 0.1.0')
    await metadata([
      'format = "ki-chatgpt-capture"',
      'format_version = "0.1.0"',
      'capture_boundary = "valid boundary"',
      'omissions = ["not compact", "array"]'
    ])
    expect((await importCapture()).output).toContain('omissions must be a compact array of plain strings')
  })

  test('rejects malformed relationship records', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const relationship = join(capture, 'relationships/native.jsonl')
    const importCapture = (): Promise<CommandResult> => box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])

    await writeFile(relationship, '\n')
    expect((await importCapture()).output).toContain('relationships/native.jsonl contains a blank record')
    const duplicate = '{"type":"conversation-order","record":"records/conversation.md","position":1}'
    await writeFile(relationship, `${duplicate}\n${duplicate}\n`)
    expect((await importCapture()).output).toContain('relationships/native.jsonl contains a duplicate record')
    await writeFile(relationship, '{"type":"conversation-order","record":"records/missing.md","position":1}\n')
    expect((await importCapture()).output).toContain('relationship references a missing record')
    await writeFile(join(capture, 'records/second.md'), '# second record\n')
    await writeFile(relationship, `${duplicate}\n{"type":"conversation-order","record":"records/second.md","position":1}\n`)
    expect((await importCapture()).output).toContain('relationship repeats a conversation position')
    await writeFile(relationship, '{"type":"project-conversation","record":"records/conversation.md","project_id":"project-001"}\n')
    expect((await importCapture()).exitCode).toBe(0)
  })

  test('rejects missing capture elements and unsafe output locations', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (destination = output): Promise<CommandResult> =>
      box.run(['acquire', 'chatgpt', 'import', capture, '--output', destination])

    await rm(join(capture, 'relationships/native.jsonl'))
    expect((await importCapture()).output).toContain('relationships/native.jsonl is required')
    await writeFile(join(capture, 'relationships/native.jsonl'), '')
    expect((await importCapture()).exitCode).toBe(0)
    expect((await importCapture(join(capture, 'nested.kep'))).output).toContain('output directory must be outside capture-directory')
    expect((await box.run(['acquire', 'chatgpt', 'import', join(box.root.path, 'missing'), '--output', output])).output).toContain(
      'capture-directory must be an existing directory'
    )
  })

  test('rejects empty directories, symbolic links and unsupported top-level entries', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])

    await rm(join(capture, 'originals/export.json'))
    expect((await importCapture()).output).toContain('originals directory must contain at least one file')
    await writeFile(join(capture, 'originals/export.json'), '{}\n')
    await rm(join(capture, 'records/conversation.md'))
    expect((await importCapture()).output).toContain('records directory must contain at least one file')
    await writeFile(join(capture, 'records/conversation.md'), '# conversation\n')
    await writeFile(join(capture, 'unexpected.txt'), 'unexpected\n')
    expect((await importCapture()).output).toContain('capture-directory contains an unsupported top-level entry')
    await rm(join(capture, 'unexpected.txt'))
    await symlink(join(capture, 'assets/example.png'), join(capture, 'assets/link.png'))
    expect((await importCapture()).output).toContain('capture contains an unsafe file')
  })

  test('rejects unsafe relationships, paths and output parents', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const relationship = join(capture, 'relationships/native.jsonl')
    const importCapture = (destination = output): Promise<CommandResult> =>
      box.run(['acquire', 'chatgpt', 'import', capture, '--output', destination])

    await writeFile(relationship, '{"type":"conversation-order","record":"records/../conversation.md","position":1}\n')
    expect((await importCapture()).output).toContain('relationship record path is unsafe')
    await writeFile(
      relationship,
      '{"type":"message-asset","record":"records/conversation.md","asset":"assets/../example.png","message_id":"message-001"}\n'
    )
    expect((await importCapture()).output).toContain('relationship asset path is unsafe')
    await writeFile(
      relationship,
      '{"type":"message-asset","record":"records/../conversation.md","asset":"assets/example.png","message_id":"message-001"}\n'
    )
    expect((await importCapture()).output).toContain('relationship record path is unsafe')
    await writeFile(
      relationship,
      '{"type":"message-asset","record":"records/missing.md","asset":"assets/example.png","message_id":"message-001"}\n'
    )
    expect((await importCapture()).output).toContain('relationship references a missing record')
    await writeFile(relationship, '{"type":"project-conversation","record":"records/../conversation.md","project_id":"project-001"}\n')
    expect((await importCapture()).output).toContain('relationship record path is unsafe')
    await writeFile(relationship, '{"type":"project-conversation","record":"records/missing.md","project_id":"project-001"}\n')
    expect((await importCapture()).output).toContain('relationship references a missing record')
    await writeFile(relationship, '{"type":"unsupported"}\n')
    expect((await importCapture()).output).toContain('relationship is not a supported source-native record')
    expect((await importCapture(`${box.root.path}/missing-parent/result.kep`)).output).toContain(
      'output parent directory must be an existing directory'
    )
    expect((await importCapture(`${box.root.path}/missing-parent/..`)).output).toContain('output directory name is invalid')
  })

  test('removes a partially written package after an output error', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    writeFailure.enabled = true

    await expect(box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])).rejects.toThrow('write failure')
    await expect(lstat(output)).rejects.toThrow()
  })

  test('rejects symbolic captures, invalid top-level types and unsafe names', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])

    await writeFile(join(capture, 'assets/file with spaces.png'), 'unsafe name\n')
    expect((await importCapture()).output).toContain('assets contains an unsafe path')
    await rm(join(capture, 'assets/file with spaces.png'))
    await symlink(join(capture, 'capture.toml'), join(capture, 'metadata-link.toml'))
    await rm(join(capture, 'capture.toml'))
    await symlink(join(capture, 'metadata-link.toml'), join(capture, 'capture.toml'))
    expect((await importCapture()).output).toContain('capture-directory contains an unsupported file type')
    await rm(join(capture, 'capture.toml'))
    await writeFile(
      join(capture, 'capture.toml'),
      ['format = "ki-chatgpt-capture"', 'format_version = "0.1.0"', 'capture_boundary = "valid boundary"', 'omissions = []', ''].join('\n')
    )
    await symlink(capture, join(box.root.path, 'capture-link'))
    expect((await box.run(['acquire', 'chatgpt', 'import', join(box.root.path, 'capture-link'), '--output', output])).output).toContain(
      'capture-directory must not be a symbolic link'
    )
  })

  test('validates nested trees, special file types, missing directories and text dry-run output', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const relationship = join(capture, 'relationships/native.jsonl')
    const importCapture = (): Promise<CommandResult> => box.run(['acquire', 'chatgpt', 'import', capture, '--output', output])

    await mkdir(join(capture, 'assets/nested'))
    await writeFile(join(capture, 'assets/nested/asset.txt'), 'nested asset\n')
    await writeFile(relationship, '{"type":"conversation-order","record":"records/conversation.md","position":1}')
    expect((await importCapture()).exitCode).toBe(0)
    await rm(output, { recursive: true })
    await mkfifo('mkfifo', [join(capture, 'assets/pipe')])
    expect((await importCapture()).output).toContain('capture contains an unsafe file')
    await rm(join(capture, 'assets/pipe'))
    await rm(join(capture, 'assets'), { recursive: true })
    expect((await importCapture()).output).toContain('assets directory is required')

    const dryBox = await sandbox()
    const dryCapture = await makeCapture(dryBox.root.path)
    const dryOutput = join(box.root.path, 'dry-result.kep')
    const dry = await box.run(['acquire', 'chatgpt', 'import', dryCapture, '--output', dryOutput, '--dry-run'])
    expect(dry.output).toContain('KEP plan:')
    expect(dry.output).toContain('Dry run: no files written.')
  })

  test('does not use the network or repository tools', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'isolated.kep')
    const spies = join(box.root.path, 'spies')
    await mkdir(spies)
    await Promise.all(['curl', 'git', 'open'].map(async (name) => symlink('/usr/bin/false', join(spies, name))))
    const parentPath = (process.env as NodeJS.ProcessEnv & { PATH?: string }).PATH
    const result = await box.run(['acquire', 'chatgpt', 'import', capture, '--output', output], { PATH: `${spies}:${parentPath}` })

    expect(result.exitCode).toBe(0)
    expect(await readFile(join(output, 'kep.toml'), 'utf8')).toContain('format = "kep"')
  })
})
