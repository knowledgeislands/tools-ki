import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { discoverInstalledHarnesses } from '../../core/harness/index.ts'
import { inspectLocalRegistry } from '../../core/storage/index.ts'
import { renderTree } from '../presentation/index.ts'

const treeEntries = (items: readonly string[]) =>
  items.length ? items.map((label) => ({ label })) : [{ label: 'none' }]

export const createListCommand = (context: KiContext): Command =>
  new Command('list').description('list installed harness capabilities and declared skills').action(async () => {
    const [harnesses, userConfiguration, registry] = await Promise.all([
      discoverInstalledHarnesses(context.paths.data),
      inspectUserConfiguration(context.paths.config),
      inspectLocalRegistry(context.paths.state)
    ])
    if (userConfiguration.state === 'invalid')
      throw new KiError(`ki configuration is invalid: ${userConfiguration.errors.join('; ')}`, 1)
    if (registry.state === 'invalid')
      throw new KiError(`local KI repository registry is invalid: ${registry.errors.join('; ')}`, 1)
    const skills = [...userConfiguration.skills].sort((left, right) => left.localeCompare(right))
    const capabilities = harnesses.reduce((total, harness) => total + harness.capabilities.length, 0)
    context.stdout.write(
      `${renderTree({
        title: 'KI MANAGE',
        entries: [
          {
            label: `harnesses (${harnesses.length})`,
            children: harnesses.length
              ? harnesses.map((harness) => ({
                  label: `${harness.id} (${harness.capabilities.length})`,
                  children: treeEntries(
                    harness.capabilities.map((capability) => `${capability.kind} ${capability.name}`)
                  )
                }))
              : [{ label: 'none' }]
          },
          { label: `user skills (${skills.length})`, children: treeEntries(skills) },
          {
            label: `repositories (${registry.repositories.length})`,
            children: treeEntries(registry.repositories.map((repository) => `${repository.key}: ${repository.path}`))
          },
          {
            label: `summary: HARNESSES=${harnesses.length} CAPABILITIES=${capabilities} USER_SKILLS=${skills.length} REPOSITORIES=${registry.repositories.length}`
          }
        ]
      }).join('\n')}\n`
    )
  })
