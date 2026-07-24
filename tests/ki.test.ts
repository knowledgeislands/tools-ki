import { afterEach, describe, expect, test } from 'bun:test'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repository = new URL('..', import.meta.url).pathname
const executable = new URL('../bin/ki', import.meta.url).pathname
const installer = new URL('../install.sh', import.meta.url).pathname
const validator = new URL('./validate-kep.sh', import.meta.url).pathname
const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

const run = async (command: string[], environment: Record<string, string | undefined> = {}): Promise<CommandResult> => {
  const child = Bun.spawn(command, {
    cwd: repository,
    env: { ...process.env, _: command[0], ...environment },
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { exitCode, output: `${stdout}${stderr}` }
}

const runKi = (arguments_: string[], environment: Record<string, string | undefined> = {}): Promise<CommandResult> =>
  run([executable, ...arguments_], environment)

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
    expect(version.output).toBe('ki 0.2.0\n')
    expect(paths.output).toContain(`"executable":"${executable}"`)
    expect(paths.output).toContain(`"data":"${missingHome}/data/ki"`)
    expect(singular.exitCode).toBe(2)
  })

  test('distinguishes a linked source installation', async () => {
    const root = await temporaryDirectory()
    const installDirectory = join(root, 'bin')
    const result = await run(['bash', installer, '--link'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await run([join(installDirectory, 'ki'), 'doctor'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(true)
    expect(doctor.output).toContain('installation: linked development checkout')
  })

  test('installs a compiled regular executable without Bun at runtime', async () => {
    const root = await temporaryDirectory()
    const installDirectory = join(root, 'bin')
    expect((await run(['bun', 'run', 'build'])).exitCode).toBe(0)
    const result = await run(['bash', installer, '--copy'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await run([join(installDirectory, 'ki'), 'doctor'])

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
    expect((await run(['bash', validator, first])).exitCode).toBe(0)
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
