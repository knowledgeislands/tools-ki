import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora/index.ts'
import { renderTree } from '../presentation/index.ts'

export const createAgoraShowCommand = (context: KiContext): Command =>
  new Command('show')
    .description('show one declared Agora or the registered estate')
    .argument('<agora>', 'Agora name')
    .option('-v, --verbose', 'show repository URLs and local paths')
    .action(async (value: string, options: { readonly verbose?: boolean }) => {
      const profile = await resolveAgora(context.paths.state, value, {
        runner: context.runner,
        environment: context.environment
      })
      const hasReferenceSurface = Boolean(profile.references.length || profile.referenceDiagnostics.length)
      const visibleMembers = profile.members.filter((member) => member.kind === 'member')
      const members = visibleMembers.length
        ? visibleMembers.map((member) => ({
            label: member.key,
            ...(options.verbose
              ? {
                  children: [{ label: `repository: ${member.repository}` }, { label: `path: ${member.root}` }]
                }
              : {})
          }))
        : [{ label: 'none' }]
      const references = profile.references.length
        ? profile.references.map((reference) => ({
            label: `${reference.repository} [included]`,
            ...(options.verbose ? { children: [{ label: `path: ${reference.root}` }] } : {})
          }))
        : [{ label: 'none' }]
      const diagnostics = profile.referenceDiagnostics.length
        ? profile.referenceDiagnostics.map((diagnostic) => ({
            label: `${diagnostic.repository} [${diagnostic.status}]`,
            children: [{ label: diagnostic.detail }]
          }))
        : [{ label: 'none' }]
      context.stdout.write(
        `${renderTree({
          title: 'KI AGORA',
          entries: [
            {
              label: profile.id,
              children: [
                { label: `title: ${profile.title}` },
                { label: `purpose: ${profile.purpose}` },
                ...(profile.home
                  ? [
                      {
                        label: `home: ${profile.home.repository}`,
                        ...(options.verbose ? { children: [{ label: `path: ${profile.home.root}` }] } : {})
                      }
                    ]
                  : [])
              ]
            },
            { label: `${profile.system ? 'repositories' : 'members'} (${visibleMembers.length})`, children: members },
            ...(hasReferenceSurface
              ? [
                  { label: `inclusions (${profile.references.length})`, children: references },
                  { label: `inclusion diagnostics (${profile.referenceDiagnostics.length})`, children: diagnostics }
                ]
              : []),
            {
              label: profile.system
                ? `summary: REPOSITORIES=${visibleMembers.length} ROOTS=${profile.roots.length}`
                : `summary: HOME=1 MEMBERS=${visibleMembers.length} INCLUSIONS=${profile.references.length} UNRESOLVED_INCLUSIONS=${profile.referenceDiagnostics.length} ROOTS=${profile.roots.length}`
            }
          ]
        }).join('\n')}\n`
      )
    })
