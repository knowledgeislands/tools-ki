import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type BootstrapOperationEvent, bootstrapEnvironment } from '../../core/harness/index.ts'
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
    ? `To resume, run ki dev local set ${event.harness} <checkout> and then ki dev local on ${event.harness}`
    : `To resume, run ki dev local on ${event.harness} once its checkout is available`

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
    case 'canonical-harness-local':
      return `canonical harness kept in local development\t${event.path}\n`
    case 'development-binding-lost':
      return `ki: warning: leaving local development for ${event.harness}: ${developmentLoss(event)}; restoring the verified archive and re-pointing its configured skills. ${developmentRecovery(event)}\n`
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
        (event.kind === 'development-binding-lost' ? context.stderr : context.stdout).write(renderBootstrapEvent(event))
      )
    })
