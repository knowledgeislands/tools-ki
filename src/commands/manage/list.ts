import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { discoverInstalledBackpacks } from '../../core/backpack/index.ts'
import { KiError } from '../../core/errors.ts'
import { inspectLocalRegistry, invalidRegistryError } from '../../core/storage/index.ts'
import { renderTree } from '../presentation/index.ts'

const treeEntries = (items: readonly string[]) =>
  items.length ? items.map((label) => ({ label })) : [{ label: 'none' }]

export const createListCommand = (context: KiContext): Command =>
  new Command('list').description('list installed backpack capabilities and declared skills').action(async () => {
    const [backpacks, userConfiguration, registry] = await Promise.all([
      discoverInstalledBackpacks(context.paths.data),
      inspectUserConfiguration(context.paths.config),
      inspectLocalRegistry(context.paths.state)
    ])
    if (userConfiguration.state === 'invalid')
      throw new KiError(`ki configuration is invalid: ${userConfiguration.errors.join('; ')}`, 1)
    if (registry.state === 'invalid') throw invalidRegistryError(context.paths.state, registry.errors)
    const skills = [...userConfiguration.skills].sort((left, right) => left.localeCompare(right))
    const capabilities = backpacks.reduce((total, backpack) => total + backpack.capabilities.length, 0)
    context.stdout.write(
      `${renderTree({
        title: 'KI INVENTORY',
        entries: [
          {
            label: `backpacks (${backpacks.length})`,
            children: backpacks.length
              ? backpacks.map((backpack) => ({
                  label: `${backpack.id} (${backpack.capabilities.length})`,
                  children: treeEntries(
                    backpack.capabilities.map((capability) => `${capability.kind} ${capability.name}`)
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
            label: `summary: BACKPACKS=${backpacks.length} CAPABILITIES=${capabilities} USER_SKILLS=${skills.length} REPOSITORIES=${registry.repositories.length}`
          }
        ]
      }).join('\n')}\n`
    )
  })
