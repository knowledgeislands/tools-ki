import { Command } from 'commander'
import { inspectUserConfiguration } from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { readDeclaredSkills } from '../core/configuration.ts'
import { grammarError, KiError } from '../core/errors.ts'
import { canonicalHarnessIdentifier, discoverInstalledHarnesses, type InstalledHarness } from '../core/harness.ts'
import {
  installHarness,
  isCanonicalHarnessDevelopmentLinked,
  readHarnessRegistry,
  recordInstalledHarness,
  uninstallHarness
} from '../core/registry.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const capabilityName = /^[a-z0-9][a-z0-9-]*$/

interface LifecycleTarget {
  readonly identifier?: string
  readonly capability: string
}

interface ResolvedTarget {
  readonly identifier: string
  readonly capability?: string
  readonly harness?: InstalledHarness
}

const targetGrammar = 'lifecycle target must be a harness id, harness id:skill, or bare skill capability'

const parseTarget = (value: string): LifecycleTarget => {
  const separator = value.indexOf(':')
  if (separator === -1) {
    if (harnessIdentifier.test(value)) return { identifier: value, capability: '' }
    if (capabilityName.test(value)) return { capability: value }
    throw grammarError(targetGrammar)
  }
  const identifier = value.slice(0, separator)
  const capability = value.slice(separator + 1)
  if (value.indexOf(':', separator + 1) !== -1 || !harnessIdentifier.test(identifier) || !capabilityName.test(capability)) {
    throw grammarError(targetGrammar)
  }
  return { identifier, capability }
}

const requireCapability = (harness: InstalledHarness, capability: string): void => {
  if (capability && !harness.capabilities.some((candidate) => candidate.name === capability)) {
    throw new KiError(`harness ${harness.id} does not provide skill ${capability}`, 1)
  }
}

const resolveTarget = (target: LifecycleTarget, harnesses: readonly InstalledHarness[]): ResolvedTarget => {
  if (target.identifier) {
    const harness = harnesses.find((candidate) => candidate.id === target.identifier)
    if (harness) requireCapability(harness, target.capability)
    return { identifier: target.identifier, capability: target.capability || undefined, harness }
  }
  const providers = harnesses.filter((harness) => harness.capabilities.some((candidate) => candidate.name === target.capability))
  if (!providers.length) {
    throw new KiError(
      `skill ${target.capability} is not installed; use <harness-id>:${target.capability} to acquire a configured supplier`,
      1
    )
  }
  if (providers.length > 1) {
    throw new KiError(`skill ${target.capability} is provided by multiple installed harnesses; use <harness-id>:${target.capability}`, 1)
  }
  const provider = providers[0] as InstalledHarness
  return { identifier: provider.id, capability: target.capability, harness: provider }
}

const configured = async (context: KiContext, identifier: string): Promise<void> => {
  const releases = await readHarnessRegistry(context.paths.config)
  if (!releases.some((candidate) => candidate.id === identifier)) {
    throw new KiError(`harness ${identifier} is not configured in the immutable release registry`, 1)
  }
}

const activeRemovalActions = async (context: KiContext, harness: InstalledHarness): Promise<readonly string[]> => {
  const active: string[] = []
  const names = new Set(harness.capabilities.map((capability) => capability.name))
  const user = await inspectUserConfiguration(context.paths.config)
  if (user.state === 'invalid') throw new KiError(`ki configuration is invalid: ${user.errors.join('; ')}`, 1)
  for (const declaration of user.skills) {
    const prefix = `${harness.id}:`
    if (declaration.startsWith(prefix) && names.has(declaration.slice(prefix.length))) {
      active.push(`ki skill user remove ${declaration.slice(prefix.length)}`)
    }
  }
  if (context.repository) {
    const declarations = await readDeclaredSkills(context.repository.configuration)
    for (const declaration of declarations) {
      if (declaration.harness === harness.id && names.has(declaration.name)) active.push(`ki skill repo remove ${declaration.name}`)
    }
  }
  return active
}

const requireInactive = async (context: KiContext, harness: InstalledHarness, action: 'reinstall' | 'uninstall'): Promise<void> => {
  const removals = await activeRemovalActions(context, harness)
  if (removals.length) {
    throw new KiError(`cannot ${action} ${harness.id} while it has active skills; run ${removals.join(' and ')} first`, 1)
  }
}

const requireNotDevelopmentLinked = async (context: KiContext, identifier: string): Promise<void> => {
  if (identifier === canonicalHarnessIdentifier && (await isCanonicalHarnessDevelopmentLinked(context.paths.data))) {
    throw new KiError(`the canonical harness ${identifier} is development-linked; run ki dev off before reinstalling`, 1)
  }
}

const createInstallCommand = (context: KiContext): Command =>
  new Command('install')
    .description('install one configured harness or supplier-qualified capability without activating it')
    .argument('<target>', 'harness id, harness id:skill, or installed bare skill capability')
    .option('--dry-run', 'validate the configured target without downloading or changing state')
    .action(async (value: string, options: { dryRun?: boolean }) => {
      const target = parseTarget(value)
      const resolved = resolveTarget(target, await discoverInstalledHarnesses(context.paths.data))
      if (resolved.harness) {
        if (!options.dryRun) await recordInstalledHarness(context.paths.config, resolved.identifier, true)
        context.stdout.write(`${resolved.identifier} is already installed\n`)
        return
      }
      await configured(context, resolved.identifier)
      if (options.dryRun) {
        context.stdout.write(`would install ${resolved.identifier}\n`)
        return
      }
      const installation = await installHarness(context.paths.config, context.paths.data, resolved.identifier, context.fetcher, {
        requiredCapability: resolved.capability
      })
      await recordInstalledHarness(context.paths.config, resolved.identifier, true)
      context.stdout.write(`installed ${resolved.identifier}\tarchive ${installation.archiveSha256}\n`)
    })

const createReinstallCommand = (context: KiContext): Command =>
  new Command('reinstall')
    .description('replace one installed configured harness or capability with a verified archive without activating it')
    .argument('<target>', 'installed harness id, harness id:skill, or installed bare skill capability')
    .option('--dry-run', 'verify that the target can be replaced without downloading or changing state')
    .action(async (value: string, options: { dryRun?: boolean }) => {
      const target = parseTarget(value)
      const resolved = resolveTarget(target, await discoverInstalledHarnesses(context.paths.data))
      if (!resolved.harness) throw new KiError(`harness ${resolved.identifier} is not installed; run ki install ${value} first`, 1)
      await requireInactive(context, resolved.harness, 'reinstall')
      await requireNotDevelopmentLinked(context, resolved.identifier)
      await configured(context, resolved.identifier)
      if (options.dryRun) {
        context.stdout.write(`would reinstall ${resolved.identifier}\n`)
        return
      }
      const installation = await installHarness(context.paths.config, context.paths.data, resolved.identifier, context.fetcher, {
        requiredCapability: resolved.capability,
        replace: true
      })
      await recordInstalledHarness(context.paths.config, resolved.identifier, true)
      context.stdout.write(`reinstalled ${resolved.identifier}\tarchive ${installation.archiveSha256}\n`)
    })

const createUninstallCommand = (context: KiContext): Command =>
  new Command('uninstall')
    .description('remove one installed non-canonical harness or capability without changing activation')
    .argument('<target>', 'installed harness id, harness id:skill, or installed bare skill capability')
    .option('--dry-run', 'verify that the target can be removed without changing state')
    .action(async (value: string, options: { dryRun?: boolean }) => {
      const target = parseTarget(value)
      const resolved = resolveTarget(target, await discoverInstalledHarnesses(context.paths.data))
      if (!resolved.harness) throw new KiError(`harness ${resolved.identifier} is not installed`, 1)
      if (resolved.identifier === canonicalHarnessIdentifier) {
        throw new KiError(`the canonical harness ${resolved.identifier} cannot be uninstalled`, 1)
      }
      await requireInactive(context, resolved.harness, 'uninstall')
      const removal = await uninstallHarness(context.paths.data, resolved.identifier, options.dryRun)
      if (removal.uninstalled) await recordInstalledHarness(context.paths.config, resolved.identifier, false)
      context.stdout.write(removal.uninstalled ? `uninstalled ${resolved.identifier}\n` : `would uninstall ${resolved.identifier}\n`)
    })

export const createLifecycleCommands = (context: KiContext): readonly Command[] => [
  createInstallCommand(context),
  createReinstallCommand(context),
  createUninstallCommand(context)
]
