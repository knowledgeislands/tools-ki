import { Command } from 'commander'
import { repoHelpCommandNames } from '../commands/catalogue.ts'
import { createRepoDiagCommand } from '../commands/diag.ts'
import { createRepoPlanCommand } from '../commands/plan.ts'
import { createRepoSkillCommand } from '../commands/skill.ts'
import { createUpgradeCommand } from '../commands/update.ts'
import type { KiContext } from '../context.ts'
import { readDeclaredSkills } from './configuration.ts'
import { KiError } from './errors.ts'
import { discoverInstalledHarnesses } from './harness.ts'
import { resolveRepositoryTargets } from './repository.ts'
import { operationOptions, renderEducation, renderReports, runPreparedWithProgress, runWithProgress } from './repository-reporting.ts'
import { renderRepositoryConformCommand, runRepositoryConformCommands } from './repository-subprocess.ts'
import { resolveDeclaredSkills } from './resolution.ts'
import { detectFixed, educateSkill, runSkillAudit, runSkillConform } from './runtime.ts'
import { prepareScopedWrites, prepareWrites, publishWrites } from './transaction.ts'

const resolveSkills = async (context: KiContext, options: { repositories: readonly string[]; workspace?: string; skill?: string }) => {
  const repositories = await resolveRepositoryTargets({
    repositories: options.repositories,
    workspace: options.workspace,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })
  const harnesses = await discoverInstalledHarnesses(context.paths.data)
  return Promise.all(
    repositories.map(async (repository) => ({
      repository,
      skills: resolveDeclaredSkills(await readDeclaredSkills(repository.configuration), harnesses, options.skill)
    }))
  )
}

export const createRepositoryOperations = (context: KiContext): Command => {
  const command = new Command('repo')
    .description('run operations for one or more KI repositories')
    .option('--repo <path-or-pattern>', 'repository root or pattern', (value: string, previous: readonly string[] = []) => [...previous, value], [])
    .option('--workspace <group>', 'workspace group from .ki-workspace.toml in the current directory')
  const selectedRepositories = (): { readonly repositories: readonly string[]; readonly workspace?: string } => {
    const options = command.opts<{ repo: readonly string[]; workspace?: string }>()
    return { repositories: options.repo, workspace: options.workspace }
  }
  command
    .addCommand(createRepoDiagCommand(context, selectedRepositories))
    .addCommand(createRepoPlanCommand(context, selectedRepositories))
    .addCommand(createRepoSkillCommand(context, selectedRepositories))
    .addCommand(createUpgradeCommand(context, selectedRepositories))
    .addCommand(
      new Command('educate')
        .description('explain maintenance for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to explain')
        .action(async (options: { skill?: string }) => {
          const selected = await resolveSkills(context, { ...options, ...selectedRepositories() })
          for (const { skills } of selected) {
            const educations = await runWithProgress(context, 'educate', skills, (skill) => educateSkill(skill), {
              progress: 'auto',
              progressStyle: 'single',
              reporterLevels: []
            })
            if (!educations.length) context.stdout.write('ki repo educate: no declared skills\n')
            else context.stdout.write(`${educations.flatMap(renderEducation).join('\n')}\n`)
          }
        })
    )
    .addCommand(
      new Command('audit')
        .description('run registered audit operations for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to audit')
        .option('--progress <mode>', 'progress: auto, always, or never (default: auto)')
        .option('--progress-style <style>', 'progress layout: single or multi (default: single)')
        .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN)')
        .action(async (options: { skill?: string; progress?: string; progressStyle?: string; reporterLevels?: string }) => {
          const output = operationOptions('audit', options)
          const selected = await resolveSkills(context, { ...options, ...selectedRepositories() })
          let failed = false
          for (const { repository, skills } of selected) {
            const results = await runWithProgress(
              context,
              'audit',
              skills,
              async (skill, onItemComplete) => ({
                skill,
                audit: await runSkillAudit(
                  { kind: 'repository', repository: repository.root, userHome: context.homeDirectory, lstat: context.lstat },
                  skill,
                  (item) => onItemComplete(item.code)
                )
              }),
              output
            )
            const findings = results.flatMap(({ audit }) => audit.findings)
            if (!findings.length) context.stdout.write(`ki repo audit: clean (${skills.length} skills)\n`)
            renderReports(
              context,
              repository.root,
              'audit',
              results.map(({ skill, audit }) => ({ skill, findings: audit.findings })),
              output.reporterLevels
            )
            failed ||= findings.some((finding) => finding.level === 'fail')
          }
          if (failed) throw new KiError('repository audit found failures', 1)
        })
    )
    .addCommand(
      new Command('conform')
        .description('apply registered conform operations for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to conform')
        .option('--dry-run', 'validate and report without writing')
        .option('--progress <mode>', 'progress: auto, always, or never (default: auto)')
        .option('--progress-style <style>', 'progress layout: single or multi (default: single)')
        .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN,FIXED)')
        .action(async (options: { skill?: string; dryRun?: boolean; progress?: string; progressStyle?: string; reporterLevels?: string }) => {
          const output = operationOptions('conform', options)
          const selected = await resolveSkills(context, { ...options, ...selectedRepositories() })
          for (const { repository, skills } of selected) {
            const conformed = await runWithProgress(
              context,
              'conform',
              skills,
              async (skill, onItemComplete) => ({
                skill: skill.skill,
                prepared: skill,
                conform: await runSkillConform(
                  { kind: 'repository', repository: repository.root, userHome: context.homeDirectory, lstat: context.lstat },
                  skill,
                  (item) => onItemComplete(item.code)
                )
              }),
              output
            )
            const findings = conformed.flatMap(({ conform }) => conform.findings)
            const repositoryWrites = await prepareWrites(
              repository.root,
              conformed.filter(({ conform }) => conform.scope.kind === 'repository').flatMap(({ conform }) => conform.writes)
            )
            const scopedUserWrites = conformed.flatMap(({ conform }) => {
              const scope = conform.scope
              if (scope.kind !== 'user-home') return []
              return conform.writes.map((write) => ({ write, scope: { paths: scope.paths } }))
            })
            const userWrites = await prepareScopedWrites(context.homeDirectory, scopedUserWrites)
            const writes = [...repositoryWrites, ...userWrites]
            const commands = conformed.flatMap(({ conform }) => conform.commands)
            if (conformed.some(({ conform }) => conform.scope.kind === 'user-home' && conform.commands.length))
              throw new KiError('user-home rubric conform actions must be guarded direct writes; conform commands are not permitted', 1)
            for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
            for (const command of commands) context.stdout.write(`${options.dryRun ? 'would run' : 'run'} ${renderRepositoryConformCommand(command)}\n`)
            if (findings.some((finding) => finding.level === 'fail')) {
              renderReports(
                context,
                repository.root,
                'conform',
                conformed.map(({ prepared, conform }) => ({ skill: prepared, findings: conform.findings })),
                output.reporterLevels
              )
              throw new KiError('repository conform found failures', 1)
            }
            let publicationError: unknown
            try {
              await publishWrites(writes, Boolean(options.dryRun))
            } catch (error) {
              publicationError = error
            }
            if (options.dryRun) {
              renderReports(
                context,
                repository.root,
                'conform',
                conformed.map(({ prepared, conform }) => ({ skill: prepared, findings: conform.findings })),
                output.reporterLevels
              )
              if (publicationError) throw publicationError
              continue
            }
            if (!publicationError) await runRepositoryConformCommands(repository.root, commands)
            const reaudited = await runPreparedWithProgress(
              context,
              're-audit',
              conformed.map(({ prepared }) => prepared),
              async (skill, onItemComplete) => {
                const previous = conformed.find((entry) => entry.skill.identity === skill.skill.identity)
                // The re-audit selection is derived directly from conformed above; this only
                // protects a future refactor from pairing an audit with the wrong conform set.
                /* v8 ignore next */
                if (!previous) throw new KiError(`repository conform lost ${skill.skill.identity} before re-audit`, 1)
                return {
                  prepared: skill,
                  conform: previous.conform,
                  audit: await runSkillAudit(
                    { kind: 'repository', repository: repository.root, userHome: context.homeDirectory, lstat: context.lstat },
                    skill,
                    (item) => onItemComplete(item.code)
                  )
                }
              },
              output
            )
            const auditFindings = reaudited.flatMap(({ audit }) => audit.findings)
            const fixedBySkill = reaudited.map(({ conform, audit }) => detectFixed(conform.fixable, audit.items))
            renderReports(
              context,
              repository.root,
              'conform',
              reaudited.map(({ prepared, audit }, index) => ({ skill: prepared, findings: audit.findings, fixed: fixedBySkill[index] })),
              output.reporterLevels
            )
            if (publicationError) throw publicationError
            if (auditFindings.some((finding) => finding.level === 'fail')) throw new KiError('repository conform re-audit found failures', 1)
          }
        })
    )

  ;(command.commands as Command[]).sort(
    (left, right) =>
      repoHelpCommandNames.indexOf(left.name() as (typeof repoHelpCommandNames)[number]) -
      repoHelpCommandNames.indexOf(right.name() as (typeof repoHelpCommandNames)[number])
  )
  return command
}
