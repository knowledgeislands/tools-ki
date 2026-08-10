import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import {
  canonicalHarnessIdentifier,
  discoverInstalledHarnesses,
  type InstalledHarness,
  readInstalledHarness
} from '../../core/harness.ts'
import {
  installHarness,
  isCanonicalHarnessDevelopmentLinked,
  recordInstalledHarness,
  requireWritableHarnessRegistry,
  uninstallHarness
} from '../../core/registry.ts'
import { renderTree } from '../../core/tree-rendering.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

const requireHarnessIdentifier = (identifier: string): void => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
}

const activeRemovalActions = async (context: KiContext, harness: InstalledHarness): Promise<readonly string[]> => {
  const active: string[] = []
  const names = new Set(harness.capabilities.map((capability) => capability.name))
  const user = await inspectUserConfiguration(context.paths.config)
  for (const declaration of user.skills) {
    const prefix = `${harness.id}:`
    if (declaration.startsWith(prefix) && names.has(declaration.slice(prefix.length)))
      active.push(`ki skill remove ${declaration.slice(prefix.length)}`)
  }
  return active
}

const requireInactive = async (
  context: KiContext,
  harness: InstalledHarness,
  action: 'reinstall' | 'uninstall'
): Promise<void> => {
  const removals = await activeRemovalActions(context, harness)
  if (removals.length)
    throw new KiError(
      `cannot ${action} ${harness.id} while it has active skills; run ${removals.join(' and ')} first`,
      1
    )
}

export const createHarnessCommand = (context: KiContext): Command =>
  new Command('harness')
    .description('install and inspect compatible harnesses')
    .addCommand(
      new Command('install')
        .description('install one configured compatible harness')
        .argument('<harness-id>', 'configured harness identifier')
        .action(async (identifier: string) => {
          const result = await installHarness(
            context.paths.config,
            context.paths.data,
            context.paths.state,
            identifier,
            context.fetcher
          )
          await recordInstalledHarness(context.paths.config, identifier, true)
          context.stdout.write(
            result.installed
              ? `installed ${identifier}\tarchive ${result.archiveSha256}\n`
              : `${identifier} is already installed\tarchive ${result.archiveSha256}\n`
          )
        })
    )
    .addCommand(
      new Command('reinstall')
        .description('replace one inactive installed harness with a verified archive')
        .argument('<harness-id>', 'installed harness identifier')
        .action(async (identifier: string) => {
          requireHarnessIdentifier(identifier)
          const harnesses = await discoverInstalledHarnesses(context.paths.data)
          const harness = harnesses.find((candidate) => candidate.id === identifier)
          if (!harness)
            throw new KiError(`harness ${identifier} is not installed; run ki harness install ${identifier} first`, 1)
          await requireInactive(context, harness, 'reinstall')
          if (
            identifier === canonicalHarnessIdentifier &&
            (await isCanonicalHarnessDevelopmentLinked(context.paths.data))
          ) {
            throw new KiError(
              `the canonical harness ${identifier} is development-linked; run ki dev local off before reinstalling`,
              1
            )
          }
          const installation = await installHarness(
            context.paths.config,
            context.paths.data,
            context.paths.state,
            identifier,
            context.fetcher,
            {
              replace: true
            }
          )
          await recordInstalledHarness(context.paths.config, identifier, true)
          context.stdout.write(`reinstalled ${identifier}\tarchive ${installation.archiveSha256}\n`)
        })
    )
    .addCommand(
      new Command('list').description('list installed harnesses').action(async () => {
        const harnesses = await discoverInstalledHarnesses(context.paths.data)
        const capabilities = harnesses.reduce((total, harness) => total + harness.capabilities.length, 0)
        const installed = harnesses.length
          ? harnesses.map(({ id, capabilities: entries }) => ({ label: `${id} (${entries.length})` }))
          : [{ label: 'none' }]
        context.stdout.write(
          `${renderTree({
            title: 'KI HARNESSES',
            entries: [
              { label: `installed (${harnesses.length})`, children: installed },
              { label: `summary: HARNESSES=${harnesses.length} CAPABILITIES=${capabilities}` }
            ]
          }).join('\n')}\n`
        )
      })
    )
    .addCommand(
      new Command('info')
        .description('inspect one installed harness')
        .argument('<harness-id>', 'installed harness identifier')
        .action(async (identifier: string) => {
          const harness = await readInstalledHarness(context.paths.data, identifier)
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
        .description('remove one installed non-canonical harness')
        .argument('<harness-id>', 'installed non-canonical harness identifier')
        .action(async (identifier: string) => {
          requireHarnessIdentifier(identifier)
          const harnesses = await discoverInstalledHarnesses(context.paths.data)
          const harness = harnesses.find((candidate) => candidate.id === identifier)
          if (!harness) throw new KiError(`harness ${identifier} is not installed`, 1)
          if (identifier === canonicalHarnessIdentifier)
            throw new KiError(`the canonical harness ${identifier} cannot be uninstalled`, 1)
          await requireInactive(context, harness, 'uninstall')
          // The record below rewrites config.toml and cannot proceed against a file it fails to
          // parse. Reading it first keeps that refusal ahead of the removal, so a hand-edited
          // configuration costs the user an error rather than a half-uninstalled harness.
          await requireWritableHarnessRegistry(context.paths.config)
          await uninstallHarness(context.paths.data, identifier)
          await recordInstalledHarness(context.paths.config, identifier, false)
          context.stdout.write(`uninstalled ${identifier}\n`)
        })
    )
