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
    const registeredRepositories = new Set(
      profiles.flatMap((profile) => profile.members.map((member) => member.repository))
    ).size
    const entries = profiles.map((profile) => {
      const count = profile.members.filter((member) => member.kind === 'member').length
      // Every non-system profile comes from profileFromHome, which always sets home.
      const home = profile.home as NonNullable<typeof profile.home>
      const participants = profile.system
        ? `${count} ${count === 1 ? 'repository' : 'repositories'}`
        : `home: ${home.key}, ${count} ${count === 1 ? 'member' : 'members'}`
      const inclusionCounts =
        profile.references.length || profile.referenceDiagnostics.length
          ? `, ${profile.references.length} ${profile.references.length === 1 ? 'inclusion' : 'inclusions'}, ${profile.referenceDiagnostics.length} unresolved ${profile.referenceDiagnostics.length === 1 ? 'inclusion' : 'inclusions'}`
          : ''
      return {
        label: `${profile.id} [${profile.system ? 'system' : 'declared'}] ${profile.name} (${participants}${inclusionCounts})`
      }
    })
    context.stdout.write(
      `${renderTree({
        title: 'KI AGORAS',
        entries: [
          { label: `agoras (${profiles.length})`, children: entries },
          ...(broken.length
            ? [{ label: `broken (${broken.length})`, children: broken.map((message) => ({ label: message })) }]
            : []),
          {
            label: `summary: AGORAS=${profiles.length} REGISTERED_REPOSITORIES=${registeredRepositories}${broken.length ? ` BROKEN=${broken.length}` : ''}`
          }
        ]
      }).join('\n')}\n`
    )
    if (broken.length) throw new KiExit(1)
  })
