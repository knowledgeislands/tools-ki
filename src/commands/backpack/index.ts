import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  backpackIdentifier,
  inspectInstalledBackpack,
  installConfiguredBackpack,
  listInstalledBackpacks,
  reinstallInstalledBackpack,
  uninstallInstalledBackpack
} from '../../core/backpack/index.ts'
import { renderTree } from '../presentation/index.ts'
import {
  backpackInstallationPort,
  backpackQueryPort,
  backpackReinstallationPort,
  backpackUninstallationPort
} from '../shared/backpack-ports.ts'

export const createBackpackCommand = (context: KiContext): Command =>
  new Command('backpack')
    .description('install and inspect compatible backpacks')
    .addCommand(
      new Command('install')
        .description('install one configured compatible backpack')
        .argument('<backpack-id>', 'configured backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          const result = await installConfiguredBackpack(backpackInstallationPort(context), identifier)
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
        .argument('<backpack-id>', 'installed backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          const installation = await reinstallInstalledBackpack(backpackReinstallationPort(context), identifier)
          context.stdout.write(`reinstalled ${identifier}\tarchive ${installation.archiveSha256}\n`)
        })
    )
    .addCommand(
      new Command('list').description('list installed backpacks').action(async () => {
        const { backpacks, capabilityCount } = await listInstalledBackpacks(backpackQueryPort(context))
        const installed = backpacks.length
          ? backpacks.map(({ id, capabilities: entries }) => ({ label: `${id} (${entries.length})` }))
          : [{ label: 'none' }]
        context.stdout.write(
          `${renderTree({
            title: 'KI BACKPACKS',
            entries: [
              { label: `installed (${backpacks.length})`, children: installed },
              { label: `summary: BACKPACKS=${backpacks.length} CAPABILITIES=${capabilityCount}` }
            ]
          }).join('\n')}\n`
        )
      })
    )
    .addCommand(
      new Command('info')
        .description('inspect one installed backpack')
        .argument('<backpack-id>', 'installed backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          const backpack = await inspectInstalledBackpack(backpackQueryPort(context), identifier)
          const capabilities = backpack.capabilities.map(({ kind, name, source, dependsOn, rubricModule }) => ({
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
              title: 'KI BACKPACK',
              entries: [
                { label: backpack.id },
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
        .argument('<backpack-id>', 'installed non-canonical backpack identifier')
        .action(async (argument: string) => {
          const identifier = backpackIdentifier(argument)
          await uninstallInstalledBackpack(backpackUninstallationPort(context), identifier)
          context.stdout.write(`uninstalled ${identifier}\n`)
        })
    )
