import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { listAgoras } from '../../core/agora/index.ts'
import { KiExit } from '../../core/errors.ts'
import { renderTree } from '../presentation/index.ts'

export const createAgoraListCommand = (context: KiContext): Command =>
  new Command('list').description('list the registered estate and declared Agoras').action(async () => {
    const { profiles, broken } = await listAgoras(context.paths.state, {
      runner: context.runner,
      environment: context.environment
    })
    const memberRepositories = new Set(
      profiles.flatMap((profile) => profile.members.map((member) => member.repository))
    ).size
    const entries = profiles.map((profile) => ({
      label: `${profile.id} [${profile.system ? 'system' : 'declared'}] ${profile.name} (${profile.members.length} ${profile.members.length === 1 ? 'member' : 'members'}${profile.home ? `, home: ${profile.home.key}` : ''}${profile.references.length || profile.referenceDiagnostics.length ? `, ${profile.references.length} ${profile.references.length === 1 ? 'reference' : 'references'}` : ''})`
    }))
    context.stdout.write(
      `${renderTree({
        title: 'KI AGORAS',
        entries: [
          { label: `agoras (${profiles.length})`, children: entries },
          ...(broken.length
            ? [{ label: `broken (${broken.length})`, children: broken.map((message) => ({ label: message })) }]
            : []),
          {
            label: `summary: AGORAS=${profiles.length} MEMBER_REPOSITORIES=${memberRepositories}${broken.length ? ` BROKEN=${broken.length}` : ''}`
          }
        ]
      }).join('\n')}\n`
    )
    if (broken.length) throw new KiExit(1)
  })
