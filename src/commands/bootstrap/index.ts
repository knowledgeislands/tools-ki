import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type BootstrapOperationEvent, bootstrapEnvironment } from '../../core/harness/index.ts'
import { bootstrapPort } from './ports.ts'

const renderBootstrapEvent = (event: BootstrapOperationEvent): string => {
  switch (event.kind) {
    case 'configuration-created':
      return `created KI agent configuration for ${event.agentIds.join(', ') || 'no detected agents'}\n`
    case 'agents-refreshed':
      return `refreshed KI agents: ${event.agentIds.join(', ') || 'none'}\n`
    case 'canonical-harness':
      // A sandbox cannot verify the pinned canonical archive needed by the fresh-install arm.
      /* v8 ignore next */
      return `canonical harness ${event.installed ? 'installed' : 'already installed'}\tarchive ${event.archiveSha256}\n`
    case 'configuration-refreshed':
      return `refreshed ki configuration: ${event.agents} agents, ${event.harnesses} harnesses, ${event.skills} skills\n`
    case 'repositories-migrated':
      return `migrated local KI repository registry: ${event.repositories} repositories\n`
    case 'skill-projection':
      return `${event.skill} for ${event.agentId} ${event.installed ? 'installed' : 'already installed'}\n`
  }
}

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install KI core user skills')
    .option('--refresh', 'reconcile agents, harnesses, and skills from installed state')
    .action(async (options: { refresh?: boolean }) => {
      await bootstrapEnvironment(bootstrapPort(context), options, (event) =>
        context.stdout.write(renderBootstrapEvent(event))
      )
    })
