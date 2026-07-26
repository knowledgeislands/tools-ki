import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Command } from 'commander'
import { addRepoSkill, addUserSkill, removeRepoSkill, removeUserSkill } from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { resolveInstalledSkill } from '../core/resolution.ts'
import { renderRubricMarkdown } from '../core/rubric-render.ts'
import { loadRubricDefinition } from '../core/runtime-loader.ts'

const createUserCommand = (context: KiContext): Command =>
  new Command('user')
    .description('manage KI-managed skills in the user agent skill spaces')
    .addCommand(
      new Command('add')
        .description('link a harness skill into the configured user agent skill spaces')
        .argument('<skill>', 'skill capability name to link')
        .option('--replace', 're-point an existing KI-managed link at the resolved harness source')
        .action(async (skill: string, options: { replace?: boolean }) => {
          const result = await addUserSkill({
            configurationDirectory: context.paths.config,
            dataDirectory: context.paths.data,
            homeDirectory: context.homeDirectory,
            skill,
            replace: options.replace
          })
          context.stdout.write(`ki skill user add: linked ${result.skill} for ${result.agents.join(', ')}\n`)
        })
    )
    .addCommand(
      new Command('remove')
        .description('unlink a KI-managed skill from the user agent skill spaces')
        .argument('<skill>', 'skill capability name to unlink')
        .action(async (skill: string) => {
          const result = await removeUserSkill({
            configurationDirectory: context.paths.config,
            homeDirectory: context.homeDirectory,
            skill
          })
          const disposition = result.removed ? 'unlinked' : 'no KI-managed link for'
          context.stdout.write(`ki skill user remove: ${disposition} ${result.skill} for ${result.agents.join(', ')}\n`)
        })
    )

const createRepoScopeCommand = (context: KiContext): Command =>
  new Command('repo')
    .description('manage KI-managed skills in one repository')
    .addCommand(
      new Command('add')
        .description('link a harness skill into a repository and declare it in .ki-config.toml')
        .argument('<skill>', 'skill capability name to link')
        .option('--repo <path>', 'repository root (defaults to the discovered KI repository)')
        .option('--replace', 're-point an existing KI-managed link at the resolved harness source')
        .action(async (skill: string, options: { repo?: string; replace?: boolean }) => {
          const result = await addRepoSkill({
            configurationDirectory: context.paths.config,
            dataDirectory: context.paths.data,
            homeDirectory: context.homeDirectory,
            workingDirectory: context.workingDirectory,
            repository: options.repo,
            skill,
            replace: options.replace
          })
          context.stdout.write(`ki skill repo add: linked ${result.skill} into ${result.repository} for ${result.agents.join(', ')}\n`)
        })
    )
    .addCommand(
      new Command('remove')
        .description('unlink a KI-managed skill from a repository and undeclare it')
        .argument('<skill>', 'skill capability name to unlink')
        .option('--repo <path>', 'repository root (defaults to the discovered KI repository)')
        .action(async (skill: string, options: { repo?: string }) => {
          const result = await removeRepoSkill({
            configurationDirectory: context.paths.config,
            homeDirectory: context.homeDirectory,
            workingDirectory: context.workingDirectory,
            repository: options.repo,
            skill
          })
          const disposition = result.removed ? 'removed' : 'no KI-managed link or declaration for'
          context.stdout.write(
            `ki skill repo remove: ${disposition} ${result.skill} in ${result.repository} for ${result.agents.join(', ')}\n`
          )
        })
    )

const rubricTargetPath = (harnessRoot: string, capabilitySource: string): string =>
  join(harnessRoot, capabilitySource, 'references', 'rubric.md')

// A harness is dev-linked when `ki dev on` (or, in tests, an equivalent manual symlink) has
// pointed its `skills` payload root at a local checkout — the same signal `enableCanonicalHarnessDevelopment`
// establishes and `canonicalDevelopmentProjection` checks. Only a dev-linked payload can safely
// receive a `--write`: an installed archive payload is immutable and would be silently discarded.
const isDevLinkedHarness = async (harnessRoot: string): Promise<boolean> => {
  // discoverInstalledHarnesses already required this directory to exist to enumerate the
  // harness's capabilities, so the catch fallback is defensive against a concurrent mutation
  // between discovery and this check — not reachable from any current CLI input.
  /* v8 ignore next */
  const state = await lstat(join(harnessRoot, 'skills')).catch(() => undefined)
  /* v8 ignore next */
  return state?.isSymbolicLink() ?? false
}

const createRubricCommand = (context: KiContext): Command =>
  new Command('rubric')
    .description("render a skill's generated rubric catalogue, or verify it against references/rubric.md")
    .argument('<skill>', 'skill capability name whose rubric to render')
    .option('--write', 'publish the rendered catalogue to references/rubric.md (dev-linked harness installs only)')
    .action(async (skill: string, options: { write?: boolean }) => {
      const harnesses = await discoverInstalledHarnesses(context.paths.data)
      const resolved = resolveInstalledSkill(harnesses, skill)
      const definition = await loadRubricDefinition(resolved)
      const rendered = renderRubricMarkdown(definition)
      const target = rubricTargetPath(resolved.harness.root, resolved.capability.source)
      const existing = await readFile(target, 'utf8').catch(() => undefined)

      if (options.write) {
        if (!(await isDevLinkedHarness(resolved.harness.root)))
          throw new KiError(`${resolved.identity} is an installed payload; run ki dev on before writing its rubric catalogue`, 1)
        if (existing !== rendered) {
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, rendered, 'utf8')
        }
        context.stdout.write(`write ${target}\n`)
        return
      }

      if (existing === rendered) {
        context.stdout.write(`ki skill rubric: ${resolved.identity} references/rubric.md is in sync\n`)
        return
      }
      const reason = existing === undefined ? 'is missing' : 'is stale'
      context.stdout.write(
        `ki skill rubric: ${resolved.identity} references/rubric.md ${reason}; run with --write from a dev-linked harness\n`
      )
      throw new KiError(`${resolved.identity} references/rubric.md ${reason}`, 1)
    })

export const createSkillCommand = (context: KiContext): Command =>
  new Command('skill')
    .description('activate or deactivate harness skills at user or repository scope')
    .addCommand(createUserCommand(context))
    .addCommand(createRepoScopeCommand(context))
    .addCommand(createRubricCommand(context))
