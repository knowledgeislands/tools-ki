import { spawn } from 'node:child_process'
import { KiError } from './errors.ts'

export interface RepositoryConformCommand {
  readonly program: string
  readonly arguments: readonly string[]
}

export const renderRepositoryConformCommand = (command: RepositoryConformCommand): string =>
  [command.program, ...command.arguments].map((argument) => JSON.stringify(argument)).join(' ')

const runRepositoryConformCommand = async (
  repository: string,
  command: RepositoryConformCommand
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command.program, command.arguments, { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }))
  })

export const runRepositoryConformCommands = async (
  repository: string,
  commands: readonly RepositoryConformCommand[]
): Promise<void> => {
  for (const command of commands) {
    const { exitCode, stdout, stderr } = await runRepositoryConformCommand(repository, command)
    if (exitCode === 0) continue
    const detail = [stdout, stderr].filter(Boolean).join('\n').trim()
    throw new KiError(
      `direct subprocess conform failed: ${renderRepositoryConformCommand(command)}${detail ? `\n${detail}` : ''}`,
      1
    )
  }
}
