import { spawn } from 'node:child_process'

export interface CommandResult {
  readonly exitCode: number
  readonly output: string
  readonly stdout?: string
}

export interface CommandLimits {
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly platform: NodeJS.Platform
  readonly cwd?: string
}

export type Runner = (
  command: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  limits?: CommandLimits
) => Promise<CommandResult>

export const runCommand: Runner = (command, arguments_, environment, limits) =>
  new Promise((resolve, reject) => {
    if (limits?.platform === 'win32') {
      reject(new Error('bounded execution requires a POSIX process group'))
      return
    }
    const grouped = Boolean(limits)
    const child = spawn(command, arguments_, {
      env: environment,
      cwd: limits?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: grouped
    })
    let output = ''
    // Decode after collection so a UTF-8 code point split between chunks stays intact.
    const stdout: Buffer[] = []
    let bytes = 0
    let failed = false
    const stop = (reason: string): void => {
      if (failed) return
      failed = true
      if (child.pid && grouped) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      } else child.kill('SIGKILL')
      reject(new Error(reason))
    }
    const timer = limits ? setTimeout(() => stop('process timeout'), limits.timeoutMs) : undefined
    const receive = (chunk: Buffer, standard: boolean): void => {
      bytes += chunk.length
      if (limits && bytes > limits.maxBytes) {
        stop('process output limit')
        return
      }
      output += chunk.toString('utf8')
      if (standard) stdout.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => {
      receive(chunk, true)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      receive(chunk, false)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({
        exitCode: exitCode ?? 1,
        output,
        ...(limits ? { stdout: Buffer.concat(stdout).toString('utf8') } : {})
      })
    })
  })
