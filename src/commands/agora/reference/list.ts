import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import { requiredReferenceAssociations } from '../../../core/agora/index.ts'
import { renderTree } from '../../presentation/index.ts'

export const createAgoraReferenceListCommand = (context: KiContext): Command =>
  new Command('list').description('list explicit local Agora reference associations').action(async () => {
    const associations = await requiredReferenceAssociations(context.paths.state)
    context.stdout.write(
      `${renderTree({
        title: 'KI AGORA REFERENCES',
        entries: [
          {
            label: `associations (${associations.length})`,
            children: associations.length
              ? associations.map((association) => ({
                  label: association.repository,
                  children: [{ label: `path: ${association.path}` }]
                }))
              : [{ label: 'none' }]
          },
          { label: `summary: ASSOCIATIONS=${associations.length}` }
        ]
      }).join('\n')}\n`
    )
  })
