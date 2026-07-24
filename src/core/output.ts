export interface Output {
  write(chunk: string): void
}

export const processContextOptions = () => ({
  stdout: process.stdout,
  stderr: process.stderr,
  executable: (process.env as NodeJS.ProcessEnv & { _?: string })._ ?? process.argv[1] ?? 'ki',
  workingDirectory: process.cwd(),
  environment: process.env as NodeJS.ProcessEnv & { HOME?: string; USERPROFILE?: string }
})
