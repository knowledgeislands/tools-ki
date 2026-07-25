import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { onTestFinished } from 'vitest'

// A minimal shell-out harness for install.sh, isolated from the in-process `ki` CLI
// sandbox in ../cli/testkit.ts. This exists only to prove the released installer does
// what it claims outside of any TypeScript command logic, so it deliberately has no
// `run()`, no fixture builders, and no assertions about `ki`'s own behavior beyond what
// `install.sh` produces.

export interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const installerScript = new URL('../../../install.sh', import.meta.url).pathname

const executeFile = promisify(execFile)

export interface InstallSandbox {
  readonly path: string
  readonly installer: string
  readonly exec: (command: readonly [string, ...string[]], environment?: Record<string, string | undefined>) => Promise<CommandResult>
}

export const installSandbox = async (): Promise<InstallSandbox> => {
  const path = await mkdtemp(join(tmpdir(), 'ki-install-test-'))
  onTestFinished(() => rm(path, { recursive: true, force: true }))
  const home = join(path, 'home')
  await mkdir(home, { recursive: true })

  const exec = async (
    command: readonly [string, ...string[]],
    environment: Record<string, string | undefined> = {}
  ): Promise<CommandResult> => {
    try {
      const result = await executeFile(command[0], command.slice(1), {
        cwd: repositoryRoot,
        env: { PATH: process.env['PATH'], TMPDIR: process.env['TMPDIR'], HOME: home, ...environment, _: command[0] }
      })
      return { exitCode: 0, output: `${result.stdout}${result.stderr}` }
    } catch (error: unknown) {
      const result = error as { code?: number; stdout?: string; stderr?: string }
      return { exitCode: result.code ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
    }
  }

  return { path, installer: installerScript, exec }
}
