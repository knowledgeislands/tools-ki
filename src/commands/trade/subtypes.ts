import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { addKnowledgeSubtype, removeKnowledgeSubtype } from '../../core/trade/configuration-mutations.ts'
import { localRegisteredConfiguration, localRegisteredRepository } from '../../core/trade/index.ts'
import { renderTree } from '../presentation/index.ts'
import { requireText, subtype } from './shared.ts'

export const createTradeSubtypesCommand = (context: KiContext): Command =>
  new Command('subtypes')
    .description('maintain receiver-owned knowledge subtype definitions')
    .addCommand(
      new Command('add')
        .description('define one receiver-owned knowledge subtype')
        .argument('<subtype>', 'lower-case hyphenated knowledge subtype')
        .requiredOption('--description <text>', 'receiver-owned meaning of the subtype')
        .action(async (value: string, options: { readonly description?: string }) => {
          const name = subtype(value, 'knowledge subtype')
          const result = await addKnowledgeSubtype(
            (await localRegisteredRepository(context)).declaration,
            name,
            requireText(options.description, '--description')
          )
          context.stdout.write(`ki trade subtypes add: defined ${name} for ${result.repository}\n`)
        })
    )
    .addCommand(
      new Command('remove')
        .description('remove one unused receiver-owned knowledge subtype')
        .argument('<subtype>', 'lower-case hyphenated knowledge subtype')
        .action(async (value: string) => {
          const name = subtype(value, 'knowledge subtype')
          const result = await removeKnowledgeSubtype(
            (await localRegisteredConfiguration(context)).repository.declaration,
            name
          )
          context.stdout.write(`ki trade subtypes remove: removed ${name} from ${result.repository}\n`)
        })
    )
    .addCommand(
      new Command('list').description('list receiver-owned knowledge subtype definitions').action(async () => {
        const { configuration } = await localRegisteredConfiguration(context)
        const entries = Object.entries(configuration.knowledgeSubtypes)
        context.stdout.write(
          `${renderTree({
            title: 'KI TRADE KNOWLEDGE SUBTYPES',
            entries: [
              {
                label: `subtypes (${entries.length})`,
                children: entries.length
                  ? entries.map(([name, description]) => ({ label: `${name}: ${description}` }))
                  : [{ label: 'none' }]
              },
              { label: `summary: SUBTYPES=${entries.length}` }
            ]
          }).join('\n')}\n`
        )
      })
    )
