import { Command } from 'commander'
import type { KiContext } from '../core/context.ts'
import { discoverInstalledHarnesses, readInstalledHarness } from '../core/harness.ts'
import { installHarness, uninstallHarness } from '../core/registry.ts'

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
              ? `installed ${identifier}\tarchive ${result.archiveSha256}\n`
              : `${identifier} is already installed\tarchive ${result.archiveSha256}\n`
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
                harnesses: harnesses.map(({ lock }) => ({
                  id: lock.id,
                  archive: lock.archive,
                  capabilities: lock.capabilities.map(({ kind, name }) => ({ kind, name }))
                }))
              })}\n`
            )
            return
          }
          if (!harnesses.length) {
            context.stdout.write('No installed compatible harnesses.\n')
            return
          }
          for (const { lock } of harnesses) {
            context.stdout.write(`${lock.id}\tarchive ${lock.archive.sha256}\t${lock.capabilities.length} capabilities\n`)
          }
        })
    )
    .addCommand(
      new Command('info')
        .description('inspect one verified installed harness')
        .argument('<harness-id>', 'installed harness identifier')
        .option('--json', 'emit a versioned JSON result')
        .action(async (identifier: string, options: { json?: boolean }) => {
          const { lock } = await readInstalledHarness(context.paths.data, identifier)
          const capabilities = lock.capabilities.map(({ kind, name, source, dependsOn, operations }) => ({
            kind,
            name,
            source,
            depends_on: dependsOn,
            operations: operations.map(({ mode, module }) => ({ mode, module }))
          }))
          if (options.json) {
            context.stdout.write(`${JSON.stringify({ version: 1, harness: { id: lock.id, archive: lock.archive, capabilities } })}\n`)
            return
          }
          context.stdout.write(
            `${lock.id}\narchive: ${lock.archive.url}\nsha256: ${lock.archive.sha256}\ncapabilities: ${capabilities.length}\n`
          )
          for (const capability of capabilities) context.stdout.write(`  ${capability.kind} ${capability.name}\n`)
        })
    )
    .addCommand(
      new Command('uninstall')
        .description('remove one verified non-base harness')
        .argument('<harness-id>', 'installed non-base harness identifier')
        .option('--dry-run', 'verify that the harness can be removed without changing state')
        .action(async (identifier: string, options: { dryRun?: boolean }) => {
          const result = await uninstallHarness(context.paths.data, identifier, options.dryRun)
          context.stdout.write(
            result.uninstalled
              ? `uninstalled ${identifier}\tarchive ${result.archiveSha256}\n`
              : `would uninstall ${identifier}\tarchive ${result.archiveSha256}\n`
          )
        })
    )
