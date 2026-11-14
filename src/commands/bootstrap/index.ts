import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type BootstrapOperationEvent, bootstrapEnvironment } from '../../core/backpack/index.ts'
import { bootstrapPort } from './ports.ts'

const developmentLoss = (event: Extract<BootstrapOperationEvent, { readonly kind: 'development-binding-lost' }>) => {
  switch (event.reason) {
    case 'checkout-missing':
      return `its checkout ${event.target} is missing`
    case 'source-mismatch':
      return `its link targets ${event.target}, not the configured checkout ${event.configured}`
    case 'source-unconfigured':
      return `its link targets ${event.target}, but no local checkout is configured`
  }
}

const developmentRecovery = (
  event: Extract<BootstrapOperationEvent, { readonly kind: 'development-binding-lost' }>
): string =>
  event.reason === 'source-unconfigured'
    ? `To resume, run ki dev local set ${event.backpack} <checkout> and then ki dev local on ${event.backpack}`
    : `To resume, run ki dev local on ${event.backpack} once its checkout is available`

const renderBootstrapEvent = (event: BootstrapOperationEvent): string => {
  switch (event.kind) {
    case 'configuration-created':
      return `created KI agent configuration for ${event.agentIds.join(', ') || 'no detected agents'}\n`
    case 'agents-refreshed':
      return `refreshed KI agents: ${event.agentIds.join(', ') || 'none'}\n`
    case 'canonical-backpack':
      // A sandbox cannot verify the pinned canonical archive needed by the fresh-install arm.
      /* v8 ignore next */
      return `canonical backpack ${event.installed ? 'installed' : 'already installed'}\tarchive ${event.archiveSha256}\n`
    case 'canonical-backpack-local':
      return `canonical backpack kept in local development\t${event.path}\n`
    case 'development-binding-lost':
      return `ki: warning: leaving local development for ${event.backpack}: ${developmentLoss(event)}; restoring the verified archive and re-pointing its configured skills. ${developmentRecovery(event)}\n`
    case 'configuration-refreshed':
      return `refreshed ki configuration: ${event.agents} agents, ${event.backpacks} backpacks, ${event.skills} skills\n`
    case 'repositories-migrated':
      return `migrated local KI repository registry: ${event.repositories} repositories\n`
    case 'locals-migrated':
      return `moved remembered local backpack checkouts to ${event.path}: ${event.locals} backpacks\n`
    case 'skill-projection':
      return `${event.skill} for ${event.agentId} ${event.installed ? 'installed' : 'already installed'}\n`
  }
}

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install KI core user skills')
    .option('--refresh', 'reconcile agents, backpacks, and skills from installed state')
    .action(async (options: { refresh?: boolean }) => {
      await bootstrapEnvironment(bootstrapPort(context), options, (event) =>
        (event.kind === 'development-binding-lost' ? context.stderr : context.stdout).write(renderBootstrapEvent(event))
      )
    })
