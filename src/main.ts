/* v8 ignore file -- process entrypoint wiring is exercised by the installed executable, not an importing test. */

import { fileURLToPath } from 'node:url'
import { run } from './cli.ts'
import { createContext } from './context.ts'

const bundled = import.meta.url.startsWith('file:///$bunfs/')

const context = await createContext({
  stdout: process.stdout,
  stderr: process.stderr,
  // A compiled Bun executable runs its bundled entrypoint from /$bunfs; its real
  // executable is process.execPath. Source execution is necessarily a local checkout.
  executable: bundled ? process.execPath : fileURLToPath(import.meta.url),
  installation: bundled ? 'regular' : 'local',
  workingDirectory: process.cwd(),
  environment: process.env as NodeJS.ProcessEnv & { HOME?: string; USERPROFILE?: string }
})
process.exitCode = await run(process.argv.slice(2), context)
