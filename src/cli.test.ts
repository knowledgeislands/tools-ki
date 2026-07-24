import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, test, vi } from 'vitest'
import packageMetadata from '../package.json' with { type: 'json' }
import { run as runCli } from './cli.ts'
import { isSafeRelativePath } from './commands/acquire.ts'
import { createContext } from './core/context.ts'
import { createHarnessLock, renderHarnessLock } from './core/harness.ts'

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

const repository = new URL('..', import.meta.url).pathname
const executable = new URL('../bin/ki', import.meta.url).pathname
const installer = new URL('../install.sh', import.meta.url).pathname
const validator = new URL('../tests/validate-kep.sh', import.meta.url).pathname
const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  writeFailure.enabled = false
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

const executeFile = promisify(execFile)

const runProcess = async (
  command: readonly [string, ...string[]],
  environment: Record<string, string | undefined> = {}
): Promise<CommandResult> => {
  try {
    const result = await executeFile(command[0], command.slice(1), {
      cwd: repository,
      env: { ...process.env, _: command[0], ...environment }
    })
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` }
  } catch (error: unknown) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    return { exitCode: result.code ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  }
}

const runKiAt = async (
  arguments_: string[],
  workingDirectory: string,
  environment: Record<string, string | undefined> = {}
): Promise<CommandResult> => {
  let output = ''
  const write = (chunk: string): void => {
    output += chunk
  }
  const context = await createContext({
    stdout: { write },
    stderr: { write },
    executable,
    workingDirectory,
    environment: { ...process.env, _: executable, ...environment }
  })
  return { exitCode: await runCli(arguments_, context), output }
}

const runKi = (arguments_: string[], environment: Record<string, string | undefined> = {}): Promise<CommandResult> =>
  runKiAt(arguments_, repository, environment)

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

const installHarness = async (data: string, auditSource?: string, conformSource?: string): Promise<void> => {
  const root = join(data, 'ki', 'harnesses', 'example', 'harness', 'latest')
  const source = join(root, 'skills', 'ki-example')
  await mkdir(source, { recursive: true })
  const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), skill)
  const operations = [
    auditSource ? { mode: 'audit', source: auditSource } : undefined,
    conformSource ? { mode: 'conform', source: conformSource } : undefined
  ].filter((operation): operation is { readonly mode: string; readonly source: string } => operation !== undefined)
  if (operations.length) {
    await mkdir(join(source, 'scripts', 'native'), { recursive: true })
    await Promise.all(
      operations.map(async (operation) => writeFile(join(source, 'scripts', 'native', `${operation.mode}.mjs`), operation.source))
    )
  }
  const lock = await createHarnessLock(root, 'example/harness', {
    url: 'https://releases.example.test/harness.tar.gz',
    sha256: '0'.repeat(64)
  })
  await writeFile(join(root, 'harness-lock.toml'), renderHarnessLock(lock))
}

const installBootstrapHarness = async (data: string): Promise<void> => {
  const root = join(data, 'ki', 'harnesses', 'knowledgeislands', 'ki-agentic-harness', 'latest')
  const source = join(root, 'skills', 'keystone', 'ki-bootstrap')
  await mkdir(source, { recursive: true })
  await writeFile(join(source, 'SKILL.md'), '---\nname: ki-bootstrap\nki-depends-on: []\n---\n')
  const lock = await createHarnessLock(root, 'knowledgeislands/ki-agentic-harness', {
    url: 'https://releases.example.test/harness.tar.gz',
    sha256: '0'.repeat(64)
  })
  await writeFile(join(root, 'harness-lock.toml'), renderHarnessLock(lock))
}

describe('baseline commands', () => {
  test('provide help, version, plural completions, and read-only XDG inspection', async () => {
    const home = await temporaryDirectory()
    const missingHome = join(home, 'missing-home')
    const help = await runKi(['--help'])
    const completions = await runKi(['completions', 'zsh'])
    const version = await runKi(['version'])
    const paths = await runKi(['paths', '--json'], {
      XDG_DATA_HOME: join(missingHome, 'data'),
      XDG_CONFIG_HOME: join(missingHome, 'config'),
      XDG_CACHE_HOME: join(missingHome, 'cache'),
      XDG_STATE_HOME: join(missingHome, 'state')
    })
    const singular = await runKi(['completion', 'bash'])

    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('acquire')
    expect(completions.output).toContain('#compdef ki')
    expect(version.output).toBe(`ki ${packageMetadata.version}\n`)
    expect(paths.output).toContain(`"executable":"${executable}"`)
    expect(paths.output).toContain(`"data":"${missingHome}/data/ki"`)
    expect(singular.exitCode).toBe(2)
  })

  test('prints the root, nested and unknown-help command interfaces', async () => {
    const root = await runKi([])
    const nested = await runKi(['help', 'acquire', 'chatgpt', 'import'])
    const unknown = await runKi(['help', 'missing'])

    expect(root.output).toContain('Usage: ki')
    expect(nested.exitCode).toBe(0)
    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: unknown help topic: missing\n' })
  })

  test('reports every baseline output variant and command grammar errors', async () => {
    const root = await temporaryDirectory()
    const environment = {
      XDG_DATA_HOME: join(root, 'data'),
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_CACHE_HOME: join(root, 'cache'),
      XDG_STATE_HOME: join(root, 'state')
    }
    const bash = await runKi(['completions', 'bash'])
    const invalidCompletion = await runKi(['completions', 'fish'])
    const paths = await runKi(['paths'], environment)
    const doctor = await runKi(['doctor'], environment)
    const doctorJson = await runKi(['doctor', '--json'], environment)
    const optionVersion = await runKi(['--version'])
    const missingCompletionShell = await runKi(['completions'])
    const unknown = await runKi(['unknown'])

    expect(bash.output).toContain('complete -W "acquire bootstrap completions doctor harness help paths repo version --help --version" ki')
    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completions shell must be bash or zsh\n' })
    expect(paths.output).toContain(`data: ${root}/data/ki`)
    expect(doctor.output).toContain(`ki version: ${packageMetadata.version}`)
    expect(doctorJson.output).toContain(`"ki_version":"${packageMetadata.version}"`)
    expect(optionVersion).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
    expect(missingCompletionShell.exitCode).toBe(2)
    expect(unknown.exitCode).toBe(2)
  })

  test('lists only verified installed compatible harnesses', async () => {
    const root = await temporaryDirectory()
    const data = join(root, 'data')
    await installHarness(data)
    const listed = await runKi(['harness', 'list'], { XDG_DATA_HOME: data })
    const json = await runKi(['harness', 'list', '--json'], { XDG_DATA_HOME: data })

    expect(listed).toEqual({ exitCode: 0, output: `example/harness\tarchive ${'0'.repeat(64)}\t1 capabilities\n` })
    expect(json.output).toContain('"id":"example/harness"')
  })

  test('bootstraps and redetects the user-managed agent configuration without replacing it by default', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const configuration = join(root, 'config')
    const data = join(root, 'data')
    await mkdir(join(home, '.agents'), { recursive: true })
    await installBootstrapHarness(data)

    const bootstrapped = await runKi(['bootstrap'], { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data })
    const repeated = await runKi(['bootstrap'], { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data })

    expect(bootstrapped).toEqual({
      exitCode: 0,
      output: `created KI agent configuration for chatgpt-codex\ncanonical harness already installed\tarchive ${'0'.repeat(64)}\nki-bootstrap for chatgpt-codex installed\n`
    })
    expect(repeated).toEqual({
      exitCode: 0,
      output: `canonical harness already installed\tarchive ${'0'.repeat(64)}\nki-bootstrap for chatgpt-codex already installed\n`
    })
    expect(await readFile(join(configuration, 'ki', 'config.toml'), 'utf8')).toBe('schema = 1\nagents = ["chatgpt-codex"]\n')
  })

  test('links an explicit local harness without installing the canonical harness', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const harness = join(root, 'harness')
    const source = join(harness, 'skills', 'keystone', 'ki-bootstrap')
    const data = join(root, 'data')
    await mkdir(join(home, '.agents'), { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), '---\nname: ki-bootstrap\nki-depends-on: []\n---\n')

    const result = await runKi(['bootstrap', '--local', harness], {
      HOME: home,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_DATA_HOME: data
    })

    expect(result).toEqual({
      exitCode: 0,
      output: `created KI agent configuration for chatgpt-codex
using local harness ${await realpath(source)}
ki-bootstrap for chatgpt-codex installed
`
    })
    await expect(lstat(join(data, 'ki', 'harnesses'))).rejects.toThrow()
    expect((await lstat(join(home, '.agents', 'skills', 'ki-bootstrap'))).isSymbolicLink()).toBe(true)
  })

  test('inspects and removes one verified non-base harness', async () => {
    const root = await temporaryDirectory()
    const data = join(root, 'data')
    await installHarness(data)
    const environment = { XDG_DATA_HOME: data }
    const info = await runKi(['harness', 'info', 'example/harness'], environment)
    const json = await runKi(['harness', 'info', 'example/harness', '--json'], environment)
    const dryRun = await runKi(['harness', 'uninstall', 'example/harness', '--dry-run'], environment)
    const removed = await runKi(['harness', 'uninstall', 'example/harness'], environment)

    expect(info.output).toContain('archive: https://releases.example.test/harness.tar.gz')
    expect(info.output).toContain('  skill ki-example\n')
    expect(json.output).toContain('"depends_on":[]')
    expect(dryRun.output).toContain('would uninstall example/harness')
    expect(removed.output).toContain('uninstalled example/harness')
    await expect(lstat(join(data, 'ki', 'harnesses', 'example', 'harness'))).rejects.toThrow()
  })

  test("runs only a declared skill's registered native audit operation", async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const data = join(root, 'data')
    const project = join(root, 'project')
    await mkdir(home)
    await mkdir(project)
    await writeFile(join(project, '.ki-config.toml'), '[ki-example]\n')
    await installHarness(
      data,
      'export const audit = async ({ capability }) => [{ level: "info", code: "EXAMPLE-1", message: capability.identity }]\n'
    )

    const result = await runKiAt(['repo', 'audit', '--skill', 'ki-example'], project, { HOME: home, XDG_DATA_HOME: data })

    expect(result).toEqual({ exitCode: 0, output: 'info EXAMPLE-1: example/harness:ki-example\n' })
  })

  test('publishes a complete native conform write set, supports dry-run, and re-audits', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const data = join(root, 'data')
    const project = join(root, 'project')
    await mkdir(home)
    await mkdir(project)
    await writeFile(join(project, '.ki-config.toml'), '[ki-example]\n')
    await writeFile(join(project, 'governed.txt'), 'before\n')
    await installHarness(
      data,
      'import { readFile } from "node:fs/promises"\nexport const audit = async ({ repository }) => (await readFile(repository + "/governed.txt", "utf8")) === "after\\n" ? [] : [{ level: "fail", code: "EXAMPLE-1", message: "not conformed" }]\n',
      'export const conform = async () => ({ findings: [], writes: [{ path: "governed.txt", content: "after\\n" }] })\n'
    )

    const dryRun = await runKiAt(['repo', 'conform', '--dry-run'], project, { HOME: home, XDG_DATA_HOME: data })
    expect(dryRun).toEqual({ exitCode: 0, output: 'would write governed.txt\n' })
    expect(await readFile(join(project, 'governed.txt'), 'utf8')).toBe('before\n')

    const conformed = await runKiAt(['repo', 'conform'], project, { HOME: home, XDG_DATA_HOME: data })
    expect(conformed).toEqual({ exitCode: 0, output: 'write governed.txt\n' })
    expect(await readFile(join(project, 'governed.txt'), 'utf8')).toBe('after\n')
  })

  test('creates a context when the caller does not supply one and rethrows unexpected command errors', async () => {
    expect(await runCli(['version'])).toBe(0)
    const root = await temporaryDirectory()
    const context = await createContext({
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      executable,
      workingDirectory: repository,
      environment: { ...process.env, HOME: root }
    })
    await expect(
      runCli(['version'], { ...context, stdout: { write: () => Promise.reject(new Error('unexpected output')) } })
    ).rejects.toThrow('unexpected output')
  })

  test('reports a null repository outside a KI repository', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const workingDirectory = join(home, 'scratch')
    let output = ''
    await mkdir(workingDirectory, { recursive: true })
    const context = await createContext({
      stdout: { write: (chunk) => (output += chunk) },
      stderr: { write: (chunk) => (output += chunk) },
      executable,
      workingDirectory,
      environment: { HOME: home }
    })

    expect(await runCli(['doctor', '--json'], context)).toBe(0)
    expect(output).toContain('"repository":null')
  })

  test('keeps source path validation strict for direct consumers', () => {
    expect(isSafeRelativePath('')).toBe(false)
    expect(isSafeRelativePath('/absolute')).toBe(false)
    expect(isSafeRelativePath('nested//path')).toBe(false)
    expect(isSafeRelativePath('nested/../path')).toBe(false)
    expect(isSafeRelativePath('nested/file.txt')).toBe(true)
  })

  test('distinguishes a linked source installation', async () => {
    const root = await temporaryDirectory()
    const installDirectory = join(root, 'bin')
    const result = await runProcess(['bash', installer, '--link'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await runProcess([join(installDirectory, 'ki'), 'doctor'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(true)
    expect(doctor.output).toContain('installation: linked development checkout')
  })

  test('installs a compiled regular executable without Bun at runtime', async () => {
    const root = await temporaryDirectory()
    const installDirectory = join(root, 'bin')
    expect((await runProcess(['bun', 'run', 'build'])).exitCode).toBe(0)
    const result = await runProcess(['bash', installer, '--copy'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await runProcess([join(installDirectory, 'ki'), 'doctor'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(false)
    expect(doctor.output).toContain('installation: regular executable')
  })
})

describe('ChatGPT capture import', () => {
  test('creates a deterministic KEP that passes the KIS-0002 fixture validator', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const first = join(root, 'first.kep')
    const second = join(root, 'second.kep')

    expect((await runKi(['acquire', 'chatgpt', 'import', capture, '--output', first])).exitCode).toBe(0)
    expect((await runKi(['acquire', 'chatgpt', 'import', capture, '--output', second])).exitCode).toBe(0)
    expect(await readFile(join(first, 'checksums/sha256sums.txt'), 'utf8')).toBe(
      await readFile(join(second, 'checksums/sha256sums.txt'), 'utf8')
    )
    expect(await readFile(join(first, 'kep.toml'), 'utf8')).toContain('package_id = "kep:sha256:')
    expect((await runProcess(['bash', validator, first])).exitCode).toBe(0)
  })

  test('reports a dry run without writing and a versioned JSON result', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'dry-run.kep')
    const result = await runKi(['acquire', 'chatgpt', 'import', capture, '--output', output, '--dry-run', '--json'])

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
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'existing.kep')
    await writeFile(
      join(capture, 'relationships/native.jsonl'),
      '{"type":"message-asset","record":"records/conversation.md","asset":"assets/missing.png","message_id":"message-002"}\n'
    )
    const missingAsset = await runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])
    expect(missingAsset.exitCode).toBe(1)
    expect(missingAsset.output).toContain('missing asset')

    await mkdir(output)
    const conflicting = await runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])
    expect(conflicting.exitCode).toBe(1)
    expect(conflicting.output).toContain('already exists')
  })

  test('rejects malformed metadata and unsafe capture trees', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const importCapture = (): Promise<CommandResult> => runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])

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
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const importCapture = (): Promise<CommandResult> => runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])
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
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const relationship = join(capture, 'relationships/native.jsonl')
    const importCapture = (): Promise<CommandResult> => runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])

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
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const importCapture = (destination = output): Promise<CommandResult> =>
      runKi(['acquire', 'chatgpt', 'import', capture, '--output', destination])

    await rm(join(capture, 'relationships/native.jsonl'))
    expect((await importCapture()).output).toContain('relationships/native.jsonl is required')
    await writeFile(join(capture, 'relationships/native.jsonl'), '')
    expect((await importCapture()).exitCode).toBe(0)
    expect((await importCapture(join(capture, 'nested.kep'))).output).toContain('output directory must be outside capture-directory')
    expect((await runKi(['acquire', 'chatgpt', 'import', join(root, 'missing'), '--output', output])).output).toContain(
      'capture-directory must be an existing directory'
    )
  })

  test('rejects empty directories, symbolic links and unsupported top-level entries', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const importCapture = (): Promise<CommandResult> => runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])

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
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const relationship = join(capture, 'relationships/native.jsonl')
    const importCapture = (destination = output): Promise<CommandResult> =>
      runKi(['acquire', 'chatgpt', 'import', capture, '--output', destination])

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
    expect((await importCapture(`${root}/missing-parent/result.kep`)).output).toContain(
      'output parent directory must be an existing directory'
    )
    expect((await importCapture(`${root}/missing-parent/..`)).output).toContain('output directory name is invalid')
  })

  test('removes a partially written package after an output error', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    writeFailure.enabled = true

    await expect(runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])).rejects.toThrow('write failure')
    await expect(lstat(output)).rejects.toThrow()
  })

  test('rejects symbolic captures, invalid top-level types and unsafe names', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const importCapture = (): Promise<CommandResult> => runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])

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
    await symlink(capture, join(root, 'capture-link'))
    expect((await runKi(['acquire', 'chatgpt', 'import', join(root, 'capture-link'), '--output', output])).output).toContain(
      'capture-directory must not be a symbolic link'
    )
  })

  test('validates nested trees, special file types, missing directories and text dry-run output', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'result.kep')
    const relationship = join(capture, 'relationships/native.jsonl')
    const importCapture = (): Promise<CommandResult> => runKi(['acquire', 'chatgpt', 'import', capture, '--output', output])

    await mkdir(join(capture, 'assets/nested'))
    await writeFile(join(capture, 'assets/nested/asset.txt'), 'nested asset\n')
    await writeFile(relationship, '{"type":"conversation-order","record":"records/conversation.md","position":1}')
    expect((await importCapture()).exitCode).toBe(0)
    await rm(output, { recursive: true })
    await runProcess(['mkfifo', join(capture, 'assets/pipe')])
    expect((await importCapture()).output).toContain('capture contains an unsafe file')
    await rm(join(capture, 'assets/pipe'))
    await rm(join(capture, 'assets'), { recursive: true })
    expect((await importCapture()).output).toContain('assets directory is required')

    const dryCapture = await makeCapture(await temporaryDirectory())
    const dryOutput = join(root, 'dry-result.kep')
    const dry = await runKi(['acquire', 'chatgpt', 'import', dryCapture, '--output', dryOutput, '--dry-run'])
    expect(dry.output).toContain('KEP plan:')
    expect(dry.output).toContain('Dry run: no files written.')
  })

  test('does not use the network or repository tools', async () => {
    const root = await temporaryDirectory()
    const capture = await makeCapture(root)
    const output = join(root, 'isolated.kep')
    const spies = join(root, 'spies')
    await mkdir(spies)
    await Promise.all(['curl', 'git', 'open'].map(async (name) => symlink('/usr/bin/false', join(spies, name))))
    const parentPath = (process.env as NodeJS.ProcessEnv & { PATH?: string }).PATH
    const result = await runKi(['acquire', 'chatgpt', 'import', capture, '--output', output], { PATH: `${spies}:${parentPath}` })

    expect(result.exitCode).toBe(0)
    expect(await readFile(join(output, 'kep.toml'), 'utf8')).toContain('format = "kep"')
  })
})
