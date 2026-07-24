interface Output {
  write(chunk: string): void
}

export interface CommandContext {
  readonly stdout: Output
  readonly stderr: Output
  readonly executable: string
}

export const processContext = (): CommandContext => ({
  stdout: process.stdout,
  stderr: process.stderr,
  executable: (process.env as NodeJS.ProcessEnv & { _?: string })._ ?? process.argv[1] ?? 'ki'
})
