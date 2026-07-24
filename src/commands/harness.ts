import { Command } from 'commander'
import type { KiContext } from '../core/context.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'

export const createHarnessCommand = (context: KiContext): Command =>
  new Command('harness').description('inspect installed compatible harnesses').addCommand(
    new Command('list')
      .description('list verified installed harnesses')
      .option('--json', 'emit a versioned JSON result')
      .action(async (options: { json?: boolean }) => {
        const harnesses = await discoverInstalledHarnesses(context.paths.data)
        if (options.json) {
          context.stdout.write(
            `${JSON.stringify({
              version: 1,
              harnesses: harnesses.map(({ manifest }) => ({
                id: manifest.id,
                latest: manifest.latest,
                ki: manifest.ki,
                capabilities: manifest.capabilities.map(({ kind, name }) => ({ kind, name }))
              }))
            })}\n`
          )
          return
        }
        if (!harnesses.length) {
          context.stdout.write('No installed compatible harnesses.\n')
          return
        }
        for (const { manifest } of harnesses) {
          context.stdout.write(`${manifest.id}\tlatest ${manifest.latest}\t${manifest.capabilities.length} capabilities\n`)
        }
      })
  )
