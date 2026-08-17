import { spawn } from 'node:child_process'

export interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

export type Runner = (
  command: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv
) => Promise<CommandResult>

export const runCommand: Runner = (command, arguments_, environment) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, output }))
  })
