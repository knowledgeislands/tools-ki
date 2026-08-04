import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'

export const createRegistryListCommand = (context: KiContext): Command =>
  new Command('list').description('list KI repositories registered in the local user configuration').action(async () => {
    const configuration = await inspectUserConfiguration(context.paths.config)
    if (configuration.state === 'missing') throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
    if (configuration.state === 'invalid') throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
    if (configuration.repositories.length) context.stdout.write(`${configuration.repositories.join('\n')}\n`)
  })
