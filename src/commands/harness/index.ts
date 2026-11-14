import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  backpackIdentifier,
  inspectInstalledHarness,
  installConfiguredHarness,
  listInstalledHarnesses,
  reinstallInstalledHarness,
  uninstallInstalledHarness
} from '../../core/harness/index.ts'
import { renderTree } from '../presentation/index.ts'
import {
  harnessInstallationPort,
  harnessQueryPort,
  harnessReinstallationPort,
  harnessUninstallationPort
} from '../shared/harness-ports.ts'

export const createHarnessCommand = (context: KiContext): Command =>
  new Command('harness')
    .description('install and inspect compatible backpacks')
    .addCommand(
      new Command('install')
        .description('install one configured compatible backpack')
        .argument('<harness-id>', 'configured backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          const result = await installConfiguredHarness(harnessInstallationPort(context), identifier)
          context.stdout.write(
            result.installed
              ? `installed ${identifier}\tarchive ${result.archiveSha256}\n`
              : `${identifier} is already installed\tarchive ${result.archiveSha256}\n`
          )
        })
    )
    .addCommand(
      new Command('reinstall')
        .description('replace one inactive installed backpack with a verified archive')
        .argument('<harness-id>', 'installed backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          const installation = await reinstallInstalledHarness(harnessReinstallationPort(context), identifier)
          context.stdout.write(`reinstalled ${identifier}\tarchive ${installation.archiveSha256}\n`)
        })
    )
    .addCommand(
      new Command('list').description('list installed backpacks').action(async () => {
        const { harnesses, capabilityCount } = await listInstalledHarnesses(harnessQueryPort(context))
        const installed = harnesses.length
          ? harnesses.map(({ id, capabilities: entries }) => ({ label: `${id} (${entries.length})` }))
          : [{ label: 'none' }]
        context.stdout.write(
          `${renderTree({
            title: 'KI HARNESSES',
            entries: [
              { label: `installed (${harnesses.length})`, children: installed },
              { label: `summary: HARNESSES=${harnesses.length} CAPABILITIES=${capabilityCount}` }
            ]
          }).join('\n')}\n`
        )
      })
    )
    .addCommand(
      new Command('info')
        .description('inspect one installed backpack')
        .argument('<harness-id>', 'installed backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          const harness = await inspectInstalledHarness(harnessQueryPort(context), identifier)
          const capabilities = harness.capabilities.map(({ kind, name, source, dependsOn, rubricModule }) => ({
            kind,
            name,
            source,
            depends_on: dependsOn,
            rubric_module: rubricModule ?? null
          }))
          const entries = capabilities.length
            ? capabilities.map((capability) => ({ label: `${capability.kind} ${capability.name}` }))
            : [{ label: 'none' }]
          context.stdout.write(
            `${renderTree({
              title: 'KI HARNESS',
              entries: [
                { label: harness.id },
                { label: `capabilities (${capabilities.length})`, children: entries },
                { label: `summary: CAPABILITIES=${capabilities.length}` }
              ]
            }).join('\n')}\n`
          )
        })
    )
    .addCommand(
      new Command('uninstall')
        .description('remove one installed non-canonical backpack')
        .argument('<harness-id>', 'installed non-canonical backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          await uninstallInstalledHarness(harnessUninstallationPort(context), identifier)
          context.stdout.write(`uninstalled ${identifier}\n`)
        })
    )
