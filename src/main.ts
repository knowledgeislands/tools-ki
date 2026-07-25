/* v8 ignore file -- process entrypoint wiring is exercised by the installed executable, not an importing test. */
import { run } from './cli.ts'
import { createContext } from './context.ts'

const context = await createContext({
  stdout: process.stdout,
  stderr: process.stderr,
  executable: (process.env as NodeJS.ProcessEnv & { _?: string })._ ?? process.argv[1] ?? 'ki',
  workingDirectory: process.cwd(),
  environment: process.env as NodeJS.ProcessEnv & { HOME?: string; USERPROFILE?: string }
})
process.exitCode = await run(process.argv.slice(2), context)
