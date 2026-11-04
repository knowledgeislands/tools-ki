import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError, KiExit } from '../../core/errors.ts'
import {
  type AuditHealth,
  listTerritories,
  type OpenTargetName,
  openLocalTarget,
  openTargetNames,
  resolveTerritory,
  territoryReport
} from '../../core/territory/index.ts'
import type { TerritorySelection } from '../../core/territory/resolution.ts'
import type { TerritoryAbsence, TerritoryAbsenceCondition } from '../../core/territory/types.ts'
import { renderTree } from '../presentation/index.ts'
import { createTerritoryInspectCommand } from './inspect.ts'
import { territoryOptions } from './selection.ts'

const HEALTH: Readonly<Record<AuditHealth['state'], string>> = {
  sound: 'sound',
  decline: 'in decline',
  ruin: 'in ruin',
  unknown: 'unknown'
}

const auditEvidence = (health: AuditHealth): string =>
  health.audit === 'completed'
    ? `completed ${health.observedAt} FAIL=${health.failures} WARN=${health.warnings}`
    : health.audit === 'incomplete'
      ? `incomplete ${health.observedAt}`
      : 'none recorded'

/** What is wrong with one member, and what puts it right. */
const absenceText = (absence: TerritoryAbsence): string => {
  const { identity, key, path, declared } = absence
  switch (absence.condition) {
    case 'unregistered':
      return `member ${identity} is not registered; register its checkout with ki registry add, or drop it from territory_members if it was archived or deleted`
    case 'renamed':
      return `member ${identity} was renamed: ${key} at ${path} goes by ${declared}; bring territory_members, the registry and its .ki.toml to one name`
    case 'missing':
      return `member ${identity} has no checkout at ${path}, its registered path; clone it there again, or remove ${key} with ki registry remove`
    case 'unreadable':
      return `member ${identity} cannot be read at ${path}: ${absence.reason}`
    case 'elsewhere':
      return `member ${identity} names Capital ${declared} in ${path}; move it to that territory's territory_members or correct its capital`
  }
}
const CONDITIONS: readonly TerritoryAbsenceCondition[] = [
  'unregistered',
  'renamed',
  'missing',
  'unreadable',
  'elsewhere'
]

type Options = TerritorySelection & {
  readonly filter: readonly string[]
  readonly null?: boolean
  readonly verbose?: boolean
  readonly target?: OpenTargetName
}
export const createTerritoryCommand = (context: KiContext): Command => {
  const directories = { state: context.paths.state, configuration: context.paths.config }
  const warn = (message: string) => context.stderr.write(`ki: warning: ${message}\n`)
  const resolve = (options: Options) => resolveTerritory(directories, { ...options, filters: options.filter }, warn)
  const command = new Command('territory').description('discover and select territories from their Capitals')
  command.addCommand(
    new Command('list').description('list registered territory Capitals').action(async () => {
      const territories = await listTerritories(directories, warn)
      context.stdout.write(
        `${renderTree({ title: 'KI TERRITORIES', entries: territories.map((territory) => ({ label: `${territory.handle}: ${territory.name} (Capital: ${territory.capital.key}, members: ${territory.members})` })) }).join('\n')}\n`
      )
    })
  )
  command.addCommand(
    territoryOptions(new Command('roots').description('write selected physical roots for machine consumption'))
      .option('-0, --null', 'terminate roots with NUL instead of line feeds')
      .action(async (options: Options) => {
        const profile = await resolve({ ...options, absent: 'report' })
        for (const absence of profile.absent ?? []) warn(`territory ${profile.id} ${absenceText(absence)}`)
        const separator = options.null ? '\0' : '\n'
        context.stdout.write(profile.roots.map((root) => `${root.root}${separator}`).join(''))
      })
  )
  command.addCommand(
    territoryOptions(new Command('show').description('show selected territory or estate repositories'))
      .option('-v, --verbose', 'show canonical identities, physical paths and condition evidence')
      .addOption(
        new Option('--format <format>', 'text view or the versioned ki/territory/v1 JSON')
          .choices(['text', 'json'])
          .default('text')
      )
      .action(async (options: Options & { readonly format: 'text' | 'json' }) => {
        const profile = await resolve({ ...options, absent: 'report' })
        const report = await territoryReport(profile, context.paths.state)
        const absent = CONDITIONS.flatMap((condition) => {
          const found = report.absent.filter((absence) => absence.condition === condition)
          return found.length ? [{ condition, found }] : []
        })
        context.stdout.write(
          options.format === 'json'
            ? `${JSON.stringify(report, null, 2)}\n`
            : `${renderTree({ title: 'KI TERRITORY', entries: [{ label: `${report.territory.id}: ${report.territory.title}`, children: report.repositories.map((island) => ({ label: `${island.key} · maturity ${island.maturity.level ?? 'unknown'} · health ${HEALTH[island.health.state]}`, ...(options.verbose ? { children: [{ label: island.identity }, { label: island.root }, { label: `maturity: ${island.maturity.declaration}` }, { label: `audit: ${auditEvidence(island.health)}` }] } : {}) })) }, ...absent.map(({ condition, found }) => ({ label: condition, children: found.map((absence) => ({ label: absence.identity })) })), { label: `summary: REPOSITORIES=${report.repositories.length}${absent.map(({ condition, found }) => ` ${condition.toUpperCase()}=${found.length}`).join('')}` }] }).join('\n')}\n`
        )
        if (absent.length) throw new KiExit(1)
      })
  )
  command.addCommand(
    territoryOptions(new Command('audit').description('validate a selected territory or estate')).action(
      async (options: Options) => {
        const profile = await resolve({ ...options, absent: 'report' })
        const absent = profile.absent ?? []
        context.stdout.write(
          `${renderTree({ title: 'KI TERRITORY AUDIT', entries: [{ label: `${profile.id}: ${absent.length ? 'incomplete' : 'healthy'}`, children: absent.map((absence) => ({ label: `✗ ${absenceText(absence)}` })) }, { label: `summary: REPOSITORIES=${profile.roots.length} FINDINGS=${absent.length}` }] }).join('\n')}\n`
        )
        if (absent.length) throw new KiExit(1)
      }
    )
  )
  command.addCommand(
    territoryOptions(new Command('open').description('open selected repositories in a local target'))
      .addOption(new Option('--target <target>', 'local target to open').choices(openTargetNames).makeOptionMandatory())
      .action(async (options: Options & { readonly target: OpenTargetName }) => {
        const profile = await resolve(options)
        const result = await openLocalTarget(
          options.target,
          profile.roots.map((root) => root.root),
          { runner: context.runner, environment: context.environment },
          { preserveProjectionOrder: true, ownerRoot: profile.roots.find((root) => root.kind === 'owner')?.root }
        )
        if (result.exitCode)
          throw new KiError(
            `could not open territory ${profile.id}: ${result.output.trim() || result.failureMessage}`,
            result.exitCode
          )
        context.stdout.write(
          `ki territory open ${profile.id} --target ${options.target}: opened ${profile.roots.length} repositories\n`
        )
      })
  )
  command.addCommand(createTerritoryInspectCommand(context))
  return command
}
