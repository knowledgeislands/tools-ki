import { Command } from 'commander'
import type { KiContext } from '../core/context.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { installHarness } from '../core/registry.ts'

export const createHarnessCommand = (context: KiContext): Command =>
  new Command('harness')
    .description('install and inspect compatible harnesses')
    .addCommand(
      new Command('install')
        .description('install one configured, verified compatible harness')
        .argument('<harness-id>', 'configured harness identifier')
        .action(async (identifier: string) => {
          const result = await installHarness(context.paths.config, context.paths.data, identifier)
          context.stdout.write(
            result.installed
              ? `installed ${identifier}\tlatest ${result.latest}\n`
              : `${identifier} is already installed\tlatest ${result.latest}\n`
          )
        })
    )
    .addCommand(
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
