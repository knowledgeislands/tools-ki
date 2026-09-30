import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError, KiExit } from '../../core/errors.ts'
import { inspectUndeclaredSourcesStores, requiredLocalRegistry } from '../../core/storage/index.ts'
import { presentation, renderTree } from '../presentation/index.ts'
import type { RegistrySelection } from './index.ts'

export const createRegistrySourceStoresCommand = (
  context: KiContext,
  selectedRepositories: () => RegistrySelection
): Command =>
  new Command('source-stores')
    .description('warn about conventional source directories without repository declarations')
    .action(async () => {
      const selection = selectedRepositories()
      if (selection.repositories.length || selection.agora || selection.estate)
        throw grammarError('ki registry source-stores inspects the entire registry and does not accept selectors')
      const report = await inspectUndeclaredSourcesStores(
        await requiredLocalRegistry(context.paths.state),
        context.homeDirectory
      )
      context.stdout.write(
        `${renderTree({
          title: 'KI REGISTRY SOURCE STORES',
          entries: [
            {
              label: `undeclared (${report.undeclared.length})`,
              children: report.undeclared.length
                ? report.undeclared.map((store) => ({
                    label: `${presentation('status.warn').terminal} ${store.repository} [${store.kind}]`,
                    children: [
                      { label: store.path },
                      {
                        label:
                          store.kind === 'kb'
                            ? 'decision: declare and bind sources, or retire the directory'
                            : 'decision: migrate to a Knowledge Base, or retire the directory'
                      }
                    ]
                  }))
                : [{ label: 'none' }]
            },
            ...(report.diagnostics.length
              ? [
                  {
                    label: `diagnostics (${report.diagnostics.length})`,
                    children: report.diagnostics.map((diagnostic) => ({
                      label: `${presentation('status.unavailable').terminal} ${diagnostic.repository}: ${diagnostic.message} (${diagnostic.path})`
                    }))
                  }
                ]
              : []),
            { label: `summary: UNDECLARED=${report.undeclared.length} DIAGNOSTICS=${report.diagnostics.length}` }
          ]
        }).join('\n')}\n`
      )
      if (report.diagnostics.length) throw new KiExit(1)
    })
