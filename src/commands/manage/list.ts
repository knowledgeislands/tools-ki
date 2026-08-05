import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { discoverInstalledHarnesses } from '../../core/harness.ts'

const branches = (prefix: string, items: readonly string[]): readonly string[] =>
  items.length ? items.map((item, index) => `${prefix}${index === items.length - 1 ? '╰─' : '├─'} ${item}`) : [`${prefix}╰─ none`]

export const createListCommand = (context: KiContext): Command =>
  new Command('list').description('list installed harness capabilities and declared skills').action(async () => {
    const [harnesses, userConfiguration] = await Promise.all([discoverInstalledHarnesses(context.paths.data), inspectUserConfiguration(context.paths.config)])
    if (userConfiguration.state === 'invalid') throw new KiError(`ki configuration is invalid: ${userConfiguration.errors.join('; ')}`, 1)
    const skills = [...userConfiguration.skills].sort((left, right) => left.localeCompare(right))
    const capabilities = harnesses.reduce((total, harness) => total + harness.capabilities.length, 0)
    const lines = ['╭─ KI MANAGE', `├─ harnesses (${harnesses.length})`]
    if (!harnesses.length) lines.push('│  ╰─ none')
    for (const harness of harnesses) {
      const last = harness === harnesses[harnesses.length - 1]
      lines.push(`│  ${last ? '╰─' : '├─'} ${harness.id} (${harness.capabilities.length})`)
      lines.push(
        ...branches(
          `│  ${last ? '   ' : '│  '}`,
          harness.capabilities.map((capability) => `${capability.kind} ${capability.name}`)
        )
      )
    }
    lines.push(`├─ user skills (${skills.length})`, ...branches('│  ', skills))
    lines.push(`├─ repositories (${userConfiguration.repositories.length})`, ...branches('│  ', userConfiguration.repositories))
    lines.push(
      `╰─ summary: HARNESSES=${harnesses.length} CAPABILITIES=${capabilities} USER_SKILLS=${skills.length} REPOSITORIES=${userConfiguration.repositories.length}`
    )
    context.stdout.write(`${lines.join('\n')}\n`)
  })
