import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { makeCapture } from './_chatgpt_helper.ts'
import { type CommandResult, sandbox } from './_cli_helper.ts'

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

describe('[ki acquire chatgpt import]', () => {
  test('creates a deterministic KEP that conforms to the KIS-0002 payload layout', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const first = join(box.root.path, 'first.kep')
    const second = join(box.root.path, 'second.kep')

    const firstResult = await box.run(`ki acquire chatgpt import ${capture.path} --output ${first}`)
    const secondResult = await box.run(`ki acquire chatgpt import ${capture.path} --output ${second}`)
    expect(firstResult.exitCode).toBe(0)
    expect(secondResult.exitCode).toBe(0)

    const checksums = await readFile(join(first, 'checksums/sha256sums.txt'), 'utf8')
    expect(checksums).toBe(await readFile(join(second, 'checksums/sha256sums.txt'), 'utf8'))

    const checksumLines = checksums.trimEnd().split('\n')
    const paths = checksumLines.map((line) => line.slice(66))
    expect(paths).toEqual([...paths].sort((left, right) => left.localeCompare(right, 'en')))
    expect(new Set(paths).size).toBe(paths.length)
    for (const line of checksumLines) {
      const [digest, path] = [line.slice(0, 64), line.slice(66)]
      expect(digest).toMatch(/^[a-f0-9]{64}$/)
      expect(
        createHash('sha256')
          .update(await readFile(join(first, path)))
          .digest('hex')
      ).toBe(digest)
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

  test('reports a dry run without writing', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'dry-run.kep')
    const result = await box.run(`ki acquire chatgpt import ${capture.path} --output ${output} --dry-run`)

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KEP plan:')
    expect(result.output).toContain('Dry run: no files written.')
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
    await capture.write(
      'relationships/native.jsonl',
      '{"type":"message-asset","record":"records/conversation.md","asset":"assets/missing.png","message_id":"message-002"}\n'
    )
    const missingAsset = await box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)
    expect(missingAsset.exitCode).toBe(1)
    expect(missingAsset.output).toContain('missing asset')

    await mkdir(output)
    const conflicting = await box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)
    expect(conflicting.exitCode).toBe(1)
    expect(conflicting.output).toContain('already exists')
  })

  test('rejects malformed metadata and unsafe capture trees', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)

    await capture.write('capture.toml', 'format = "wrong"\n')
    const wrongFormat = await importCapture()
    expect(wrongFormat.output).toContain('capture metadata format must be ki-chatgpt-capture')

    await capture.writeMetadata(['format = "ki-chatgpt-capture"', 'format_version = "0.1.0"', 'capture_boundary = "bad\\tboundary"', 'omissions = []'])
    const badBoundary = await importCapture()
    expect(badBoundary.output).toContain('capture_boundary contains unsupported characters')

    await capture.write('records/not-markdown.txt', 'not a record\n')
    const nonMarkdown = await importCapture()
    expect(nonMarkdown.output).toContain('records must use Markdown file names')
  })

  test('rejects metadata field, repetition, version and omissions violations', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)

    await capture.writeMetadata(['unexpected = "field"'])
    const unexpectedField = await importCapture()
    expect(unexpectedField.output).toContain('capture metadata contains an unsupported field')

    await capture.writeMetadata(['format = "ki-chatgpt-capture"', 'format = "ki-chatgpt-capture"'])
    const repeatedFormat = await importCapture()
    expect(repeatedFormat.output).toContain('capture metadata repeats format')

    await capture.writeMetadata(['format = "ki-chatgpt-capture"', 'format_version = "0.2.0"'])
    const badVersion = await importCapture()
    expect(badVersion.output).toContain('capture metadata format_version must be 0.1.0')

    await capture.writeMetadata([
      'format = "ki-chatgpt-capture"',
      'format_version = "0.1.0"',
      'capture_boundary = "valid boundary"',
      'omissions = ["not compact", "array"]'
    ])
    const badOmissions = await importCapture()
    expect(badOmissions.output).toContain('omissions must be a compact array of plain strings')
  })

  test('rejects malformed relationship records', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)
    const relationship = (content: string): Promise<void> => capture.write('relationships/native.jsonl', content)

    const duplicate = '{"type":"conversation-order","record":"records/conversation.md","position":1}'

    await relationship('\n')
    const blank = await importCapture()
    expect(blank.output).toContain('relationships/native.jsonl contains a blank record')

    await relationship(`${duplicate}
${duplicate}
`)
    const duplicateResult = await importCapture()
    expect(duplicateResult.output).toContain('relationships/native.jsonl contains a duplicate record')

    await relationship('{"type":"conversation-order","record":"records/missing.md","position":1}\n')
    const missing = await importCapture()
    expect(missing.output).toContain('relationship references a missing record')

    await capture.write('records/second.md', '# second record\n')
    await relationship(`${duplicate}
{"type":"conversation-order","record":"records/second.md","position":1}
`)
    const repeatedPosition = await importCapture()
    expect(repeatedPosition.output).toContain('relationship repeats a conversation position')

    await relationship('{"type":"project-conversation","record":"records/conversation.md","project_id":"project-001"}\n')
    const finalResult = await importCapture()
    expect(finalResult.exitCode).toBe(0)
  })

  test('rejects missing capture elements and unsafe output locations', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (destination = output): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${destination}`)

    await capture.remove('relationships/native.jsonl')
    const missingRelationships = await importCapture()
    expect(missingRelationships.output).toContain('relationships/native.jsonl is required')

    await capture.write('relationships/native.jsonl', '')
    const emptyRelationships = await importCapture()
    expect(emptyRelationships.exitCode).toBe(0)

    const nestedOutput = await importCapture(join(capture.path, 'nested.kep'))
    expect(nestedOutput.output).toContain('output directory must be outside capture-directory')

    const missingCaptureDirectory = await box.run(`ki acquire chatgpt import ${join(box.root.path, 'missing')} --output ${output}`)
    expect(missingCaptureDirectory.output).toContain('capture-directory must be an existing directory')
  })

  test('rejects empty directories, symbolic links and unsupported top-level entries', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)

    await capture.remove('originals/export.json')
    const emptyOriginals = await importCapture()
    expect(emptyOriginals.output).toContain('originals directory must contain at least one file')

    await capture.write('originals/export.json', '{}\n')
    await capture.remove('records/conversation.md')
    const emptyRecords = await importCapture()
    expect(emptyRecords.output).toContain('records directory must contain at least one file')

    await capture.write('records/conversation.md', '# conversation\n')
    await capture.write('unexpected.txt', 'unexpected\n')
    const unsupportedEntry = await importCapture()
    expect(unsupportedEntry.output).toContain('capture-directory contains an unsupported top-level entry')

    await capture.remove('unexpected.txt')
    await capture.symlink('assets/example.png', 'assets/link.png')
    const unsafeFile = await importCapture()
    expect(unsafeFile.output).toContain('capture contains an unsafe file')
  })

  test('rejects unsafe relationships, paths and output parents', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (destination = output): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${destination}`)
    const relationship = (content: string): Promise<void> => capture.write('relationships/native.jsonl', content)

    await relationship('{"type":"conversation-order","record":"records/../conversation.md","position":1}\n')
    const unsafeRecordPath = await importCapture()
    expect(unsafeRecordPath.output).toContain('relationship record path is unsafe')

    await relationship('{"type":"conversation-order","record":"records//conversation.md","position":1}\n')
    const repeatedSeparator = await importCapture()
    expect(repeatedSeparator.output).toContain('relationship record path is unsafe')

    await relationship('{"type":"message-asset","record":"records/conversation.md","asset":"assets/../example.png","message_id":"message-001"}\n')
    const unsafeAssetPath = await importCapture()
    expect(unsafeAssetPath.output).toContain('relationship asset path is unsafe')

    await relationship('{"type":"message-asset","record":"records/../conversation.md","asset":"assets/example.png","message_id":"message-001"}\n')
    const unsafeAssetRecordPath = await importCapture()
    expect(unsafeAssetRecordPath.output).toContain('relationship record path is unsafe')

    await relationship('{"type":"message-asset","record":"records/missing.md","asset":"assets/example.png","message_id":"message-001"}\n')
    const missingAssetRecord = await importCapture()
    expect(missingAssetRecord.output).toContain('relationship references a missing record')

    await relationship('{"type":"project-conversation","record":"records/../conversation.md","project_id":"project-001"}\n')
    const unsafeConversationPath = await importCapture()
    expect(unsafeConversationPath.output).toContain('relationship record path is unsafe')

    await relationship('{"type":"project-conversation","record":"records/missing.md","project_id":"project-001"}\n')
    const missingConversationRecord = await importCapture()
    expect(missingConversationRecord.output).toContain('relationship references a missing record')

    await relationship('{"type":"unsupported"}\n')
    const unsupportedRelationship = await importCapture()
    expect(unsupportedRelationship.output).toContain('relationship is not a supported source-native record')

    const missingOutputParent = await importCapture(`${box.root.path}/missing-parent/result.kep`)
    expect(missingOutputParent.output).toContain('output parent directory must be an existing directory')

    const invalidOutputName = await importCapture(`${box.root.path}/missing-parent/..`)
    expect(invalidOutputName.output).toContain('output directory name is invalid')
  })

  test('removes a partially written package after an output error', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    writeFailure.enabled = true

    await expect(box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)).rejects.toThrow('write failure')
    await expect(lstat(output)).rejects.toThrow()
  })

  test('rejects symbolic captures, invalid top-level types and unsafe names', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)

    await capture.write('assets/file with spaces.png', 'unsafe name\n')
    expect((await importCapture()).output).toContain('assets contains an unsafe path')
    await capture.remove('assets/file with spaces.png')
    await capture.symlink('capture.toml', 'metadata-link.toml')
    await capture.remove('capture.toml')
    await capture.symlink('metadata-link.toml', 'capture.toml')
    expect((await importCapture()).output).toContain('capture-directory contains an unsupported file type')
    await capture.remove('capture.toml')
    await capture.writeMetadata(['format = "ki-chatgpt-capture"', 'format_version = "0.1.0"', 'capture_boundary = "valid boundary"', 'omissions = []'])
    await symlink(capture.path, join(box.root.path, 'capture-link'))
    expect((await box.run(`ki acquire chatgpt import ${join(box.root.path, 'capture-link')} --output ${output}`)).output).toContain(
      'capture-directory must not be a symbolic link'
    )
  })

  test('validates nested trees, special file types, missing directories and text dry-run output', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'result.kep')
    const importCapture = (): Promise<CommandResult> => box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)

    await capture.mkdir('assets/nested')
    await capture.write('assets/nested/asset.txt', 'nested asset\n')
    await capture.write('relationships/native.jsonl', '{"type":"conversation-order","record":"records/conversation.md","position":1}')
    expect((await importCapture()).exitCode).toBe(0)
    await rm(output, { recursive: true })
    await capture.mkfifo('assets/pipe')
    expect((await importCapture()).output).toContain('capture contains an unsafe file')
    await capture.remove('assets/pipe')
    await capture.remove('assets', { recursive: true })
    expect((await importCapture()).output).toContain('assets directory is required')

    const dryBox = await sandbox()
    const dryCapture = await makeCapture(dryBox.root.path)
    const dryOutput = join(box.root.path, 'dry-result.kep')
    const dry = await box.run(`ki acquire chatgpt import ${dryCapture.path} --output ${dryOutput} --dry-run`)
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
    box.setEnv({ PATH: `${spies}:${parentPath}` })
    const result = await box.run(`ki acquire chatgpt import ${capture.path} --output ${output}`)

    const kepToml = await readFile(join(output, 'kep.toml'), 'utf8')
    expect(result.exitCode).toBe(0)
    expect(kepToml).toContain('format = "kep"')
  })
})
