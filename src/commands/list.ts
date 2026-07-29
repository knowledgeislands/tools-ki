import { Command } from 'commander'
import { inspectUserConfiguration } from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'

const listed = (items: readonly string[]): string => (items.length ? items.map((item) => `  ${item}`).join('\n') : '  none')

export const createListCommand = (context: KiContext): Command =>
  new Command('list').description('list installed harness capabilities and declared skills').action(async () => {
    const [harnesses, userConfiguration] = await Promise.all([discoverInstalledHarnesses(context.paths.data), inspectUserConfiguration(context.paths.config)])
    if (userConfiguration.state === 'invalid') throw new KiError(`ki configuration is invalid: ${userConfiguration.errors.join('; ')}`, 1)
    const lines = ['ki list', 'Installed harnesses:']
    if (!harnesses.length) lines.push('  none')
    for (const harness of harnesses) {
      lines.push(`  ${harness.id}`)
      lines.push(listed(harness.capabilities.map((capability) => `  ${capability.kind} ${capability.name}`)))
    }
    lines.push('User skills:', listed([...userConfiguration.skills].sort((left, right) => left.localeCompare(right))))
    context.stdout.write(`${lines.join('\n')}\n`)
  })
