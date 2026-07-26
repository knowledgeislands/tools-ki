import { spawn } from 'node:child_process'
import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { readDeclaredSkills } from '../core/configuration.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { resolveRepository } from '../core/repository.ts'
import { type ResolvedSkill, resolveDeclaredSkills } from '../core/resolution.ts'
import {
  detectFixed,
  educateSkill,
  type FixedItem,
  type Finding,
  type PreparedSkill,
  prepareSkill,
  runSkillAudit,
  runSkillConform
} from '../core/runtime.ts'
import { prepareScopedWrites, prepareWrites, publishWrites } from '../core/transaction.ts'

const renderCommand = (command: { readonly program: string; readonly arguments: readonly string[] }): string =>
  [command.program, ...command.arguments].map((argument) => JSON.stringify(argument)).join(' ')

const runCommand = async (
  repository: string,
  command: { readonly program: string; readonly arguments: readonly string[] }
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command.program, command.arguments, { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }))
  })

const runCommands = async (
  repository: string,
  commands: readonly { readonly program: string; readonly arguments: readonly string[] }[]
): Promise<void> => {
  for (const command of commands) {
    const { exitCode, stdout, stderr } = await runCommand(repository, command)
    if (exitCode === 0) continue
    const detail = [stdout, stderr].filter(Boolean).join('\n').trim()
    throw new KiError(`direct subprocess repair failed: ${renderCommand(command)}${detail ? `\n${detail}` : ''}`, 1)
  }
}

const resolveSkills = async (context: KiContext, options: { repo?: string; skill?: string }) => {
  const repository = await resolveRepository({
    repository: options.repo,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })
  const declarations = await readDeclaredSkills(repository.configuration)
  const harnesses = await discoverInstalledHarnesses(context.paths.data)
  return { repository, skills: resolveDeclaredSkills(declarations, harnesses, options.skill) }
}

const FALLBACK_TERMINAL_COLUMNS = 80
const COMMAND_COLUMN_WIDTH = 10

const truncate = (text: string, width: number): string => {
  if (text.length <= width) return text
  if (width <= 0) return ''
  if (width <= 3) return '.'.repeat(width)
  return `${text.slice(0, width - 3)}...`
}

const progressBar = (width: number, complete?: number, total?: number): string => {
  const innerWidth = width - 2
  if (complete === undefined || total === undefined) return `[>${'.'.repeat(Math.max(0, innerWidth - 1))}]`
  if (total <= 0) return `[${'#'.repeat(innerWidth)}]`
  const clamped = Math.max(0, Math.min(complete, total))
  const filled = clamped === total ? innerWidth : Math.floor((clamped / total) * innerWidth)
  return `[${'#'.repeat(filled)}${'.'.repeat(innerWidth - filled)}]`
}

// Mirrors the established harness aggregate layout: a stable command column, a bar
// consuming half the remaining terminal, and a right-hand live status column.  The
// bar itself is capped at 100 columns so wide terminals do not turn it into noise.
const progressLine = (left: string, right: string, complete: number | undefined, total: number | undefined, columns: number): string => {
  const terminalWidth = Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : FALLBACK_TERMINAL_COLUMNS
  const leftWidth = Math.min(COMMAND_COLUMN_WIDTH, terminalWidth)
  const remainingWidth = terminalWidth - leftWidth - 2
  const barWidth = Math.min(100, Math.floor(remainingWidth / 2))
  const rightWidth = remainingWidth - barWidth
  if (barWidth >= 3 && rightWidth > 0)
    return `${truncate(left, leftWidth).padEnd(leftWidth)} ${progressBar(barWidth, complete, total)} ${truncate(right, rightWidth).padEnd(rightWidth)}`
  return truncate(right, terminalWidth)
}

const elapsed = (milliseconds: number): string => `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`

interface ProgressTracker {
  readonly loading: (loaded: number, total: number) => void
  readonly planned: (total: number) => void
  readonly item: (skill: PreparedSkill, code: string) => void
  readonly complete: () => void
  readonly failed: () => void
}

const createProgressTracker = (context: KiContext, operation: string): ProgressTracker | undefined => {
  if (context.stderr.isTTY !== true) return undefined
  const started = context.now()
  let complete = 0
  let total: number | undefined
  const columns = context.stderr.columns ?? FALLBACK_TERMINAL_COLUMNS
  const write = (right: string, final = false): void =>
    context.stderr.write(
      `\r\x1b[2K${progressLine(operation.toUpperCase(), right, total === undefined ? undefined : complete, total, columns)}${final ? '\n' : ''}`
    )
  return {
    loading: (loaded, definitions) => write(`${elapsed(context.now() - started)} loading ${loaded}/${definitions} definitions`),
    planned: (itemTotal) => {
      total = itemTotal
      write(`${complete}/${total} ${total === 0 ? 100 : 0}% starting`)
    },
    item: (skill, code) => {
      complete += 1
      const percentage = total === 0 ? 100 : Math.round((complete / (total ?? 1)) * 100)
      write(`${complete}/${total} ${percentage}% ${skill.skill.declaration.name} ${code}`)
    },
    complete: () => write(`${total ?? 0}/${total ?? 0} 100% complete`, true),
    failed: () => context.stderr.write('\n')
  }
}

const runPreparedWithProgress = async <Result>(
  context: KiContext,
  operation: string,
  prepared: readonly PreparedSkill[],
  run: (skill: PreparedSkill, onItemComplete: (code: string) => void) => Promise<Result>,
  progress = prepared.length ? createProgressTracker(context, operation) : undefined
): Promise<Result[]> => {
  const results: Result[] = []
  try {
    progress?.planned(prepared.reduce((count, skill) => count + skill.items.length, 0))
    for (const skill of prepared) {
      results.push(await run(skill, (code) => progress?.item(skill, code)))
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  progress?.complete()
  return results
}

const runWithProgress = async <Result>(
  context: KiContext,
  operation: string,
  skills: readonly ResolvedSkill[],
  run: (skill: PreparedSkill, onItemComplete: (code: string) => void) => Promise<Result>
): Promise<Result[]> => {
  const progress = skills.length ? createProgressTracker(context, operation) : undefined
  const prepared: PreparedSkill[] = []
  try {
    progress?.loading(0, skills.length)
    for (const skill of skills) {
      prepared.push(await prepareSkill(skill))
      progress?.loading(prepared.length, skills.length)
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  return runPreparedWithProgress(context, operation, prepared, run, progress)
}

const renderEducation = (education: Awaited<ReturnType<typeof educateSkill>>): string[] => [
  education.identity,
  `  Concern: ${education.concern}`,
  `  Scope: ${education.scope.kind === 'repository' ? 'repository' : `user home (${education.scope.paths.join(', ')})`}`,
  ...education.families.flatMap((family) => [
    `  ${family.code}: ${family.title}`,
    `    ${family.description}`,
    `    Standard: ${family.standard}`,
    ...family.items.flatMap((item) => {
      const aspects = [...(item.mechanical ? [item.mechanical.heuristic ? 'M-heuristic' : 'M'] : []), ...(item.judgment ? ['J'] : [])].join(
        ' + '
      )
      return [
        `    ${item.code} [${aspects}]: ${item.title}`,
        `      ${item.description}`,
        `      Sources: ${item.sources.join(', ')}`,
        ...(item.judgment ? [`      Review: ${item.judgment.prompt}`] : [])
      ]
    })
  ])
]

type RenderedFinding = (Finding | FixedItem) & { readonly level: Finding['level'] | 'fixed' }

interface SkillReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
  readonly fixed?: readonly FixedItem[]
}

const REPORT_ICON: Record<RenderedFinding['level'], string> = {
  fail: '❌',
  warn: '⚠️ ',
  fixed: '✅',
  info: 'ℹ️ '
}

const REPORT_LABEL: Record<RenderedFinding['level'], string> = {
  fail: 'fail',
  warn: 'warn',
  fixed: 'fixed',
  info: 'info'
}

const judgmentItemCount = (skill: PreparedSkill): number =>
  skill.definition.families.reduce((count, family) => count + family.items.filter((item) => item.judgment).length, 0)

const withFixed = (report: SkillReport): readonly RenderedFinding[] => [
  ...report.findings,
  ...(report.fixed ?? []).map((finding) => ({ ...finding, level: 'fixed' as const }))
]

const formatFinding = (finding: RenderedFinding, skill?: string, full = true): string => {
  const message = full ? finding.message : (finding.message.split(/\r?\n/, 1)[0] ?? '')
  const subject = finding.subject ? ` ${finding.subject}` : ''
  const prefix = `  ${REPORT_ICON[finding.level]} ${REPORT_LABEL[finding.level].padEnd(5)}${skill ? ` ${skill.padEnd(20)}` : ''}`
  return `${prefix} [${finding.title} (${finding.code})]${subject} — ${message.replace(/\r?\n/g, '\n    ')}`
}

const summary = (findings: readonly RenderedFinding[], judgmentUnevaluated: number): string => {
  const count = (level: RenderedFinding['level']): number => findings.filter((finding) => finding.level === level).length
  const icon = count('fail') ? REPORT_ICON.fail : count('warn') ? REPORT_ICON.warn : REPORT_ICON.fixed
  return `  ${icon} summary: FAIL=${count('fail')} WARN=${count('warn')} FIXED=${count('fixed')} JUDGMENT_UNEVALUATED=${judgmentUnevaluated}`
}

/**
 * The host owns presentation just as it owns execution. Rubric contracts return
 * structured outcomes; this renderer keeps their item title and evidence subject intact
 * instead of making each harness ship a runner merely to format a report.
 */
const renderReports = (context: KiContext, operation: 'audit' | 'conform', reports: readonly SkillReport[]): void => {
  const reportFindings = reports.map((report) => ({ report, findings: withFixed(report) }))
  for (const { report, findings } of reportFindings) {
    if (!findings.length) continue
    context.stdout.write(`\n==> ${report.skill.skill.identity}:${operation}\n`)
    for (const finding of findings) context.stdout.write(`${formatFinding(finding)}\n`)
    context.stdout.write(`${summary(findings, judgmentItemCount(report.skill))}\n`)
  }

  const findings = reportFindings.flatMap(({ report, findings: entries }) =>
    entries.map((finding) => ({ finding, skill: report.skill.skill.identity }))
  )
  const count = (level: RenderedFinding['level']): number => findings.filter(({ finding }) => finding.level === level).length
  const judgmentUnevaluated = reports.reduce((total, report) => total + judgmentItemCount(report.skill), 0)
  context.stdout.write('\n==> recap\n')
  if (!findings.length) context.stdout.write(`  ✅ no findings across ${operation === 'audit' ? 'audited' : 'conformed'} skills\n`)
  else for (const { finding, skill } of findings) context.stdout.write(`${formatFinding(finding, skill, false)}\n`)
  const icon = count('fail') ? REPORT_ICON.fail : count('warn') ? REPORT_ICON.warn : REPORT_ICON.fixed
  context.stdout.write(
    `  ${icon} totals: FAIL=${count('fail')} WARN=${count('warn')} FIXED=${count('fixed')} JUDGMENT_UNEVALUATED=${judgmentUnevaluated}\n`
  )
}

export const createRepoCommand = (context: KiContext): Command =>
  new Command('repo')
    .description('run operations for one KI repository')
    .addCommand(
      new Command('educate')
        .description('explain maintenance for declared skills')
        .option('--repo <path>', 'repository root to explain')
        .option('--skill <capability>', 'one declared resolved skill to explain')
        .action(async (options: { repo?: string; skill?: string }) => {
          const { skills } = await resolveSkills(context, options)
          const educations = await runWithProgress(context, 'educate', skills, (skill) => educateSkill(skill))
          if (!educations.length) {
            context.stdout.write('ki repo educate: no declared skills\n')
            return
          }
          context.stdout.write(`${educations.flatMap(renderEducation).join('\n')}\n`)
        })
    )
    .addCommand(
      new Command('audit')
        .description('run registered audit operations for declared skills')
        .option('--repo <path>', 'repository root to audit')
        .option('--skill <capability>', 'one declared resolved skill to audit')
        .action(async (options: { repo?: string; skill?: string }) => {
          const { repository, skills } = await resolveSkills(context, options)
          const results = await runWithProgress(context, 'audit', skills, async (skill, onItemComplete) => ({
            skill,
            audit: await runSkillAudit(
              { kind: 'repository', repository: repository.root, userHome: context.homeDirectory },
              skill,
              (item) => onItemComplete(item.code)
            )
          }))
          const findings = results.flatMap(({ audit }) => audit.findings)
          if (!findings.length) context.stdout.write(`ki repo audit: clean (${skills.length} skills)\n`)
          renderReports(
            context,
            'audit',
            results.map(({ skill, audit }) => ({ skill, findings: audit.findings }))
          )
          if (findings.some((finding) => finding.level === 'fail')) throw new KiError('repository audit found failures', 1)
        })
    )
    .addCommand(
      new Command('conform')
        .description('apply registered conform operations for declared skills')
        .option('--repo <path>', 'repository root to conform')
        .option('--skill <capability>', 'one declared resolved skill to conform')
        .option('--dry-run', 'validate and report without writing')
        .action(async (options: { repo?: string; skill?: string; dryRun?: boolean }) => {
          const { repository, skills } = await resolveSkills(context, options)
          const conformed = await runWithProgress(context, 'conform', skills, async (skill, onItemComplete) => ({
            skill: skill.skill,
            prepared: skill,
            conform: await runSkillConform(
              { kind: 'repository', repository: repository.root, userHome: context.homeDirectory },
              skill,
              (item) => onItemComplete(item.code)
            )
          }))
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
            throw new KiError('user-home rubric repairs must be transactional writes; subprocess repairs are not permitted', 1)
          for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
          for (const command of commands) context.stdout.write(`${options.dryRun ? 'would run' : 'run'} ${renderCommand(command)}\n`)
          if (findings.some((finding) => finding.level === 'fail')) {
            renderReports(
              context,
              'conform',
              conformed.map(({ prepared, conform }) => ({ skill: prepared, findings: conform.findings }))
            )
            throw new KiError('repository conform found failures', 1)
          }
          await publishWrites(writes, Boolean(options.dryRun))
          if (options.dryRun) {
            renderReports(
              context,
              'conform',
              conformed.map(({ prepared, conform }) => ({ skill: prepared, findings: conform.findings }))
            )
            return
          }
          await runCommands(repository.root, commands)
          const reaudited = await runPreparedWithProgress(
            context,
            're-audit',
            conformed.map(({ prepared }) => prepared),
            async (skill, onItemComplete) => {
              const previous = conformed.find((entry) => entry.skill.identity === skill.skill.identity)
              // The re-audit selection is derived directly from conformed above; this only
              // protects a future refactor from pairing an audit with the wrong repair set.
              /* v8 ignore next */
              if (!previous) throw new KiError(`repository conform lost ${skill.skill.identity} before re-audit`, 1)
              return {
                prepared: skill,
                conform: previous.conform,
                audit: await runSkillAudit(
                  { kind: 'repository', repository: repository.root, userHome: context.homeDirectory },
                  skill,
                  (item) => onItemComplete(item.code)
                )
              }
            }
          )
          const auditFindings = reaudited.flatMap(({ audit }) => audit.findings)
          const fixedBySkill = reaudited.map(({ conform, audit }) => detectFixed(conform.fixable, audit.items))
          renderReports(
            context,
            'conform',
            reaudited.map(({ prepared, audit }, index) => ({ skill: prepared, findings: audit.findings, fixed: fixedBySkill[index] }))
          )
          if (auditFindings.some((finding) => finding.level === 'fail'))
            throw new KiError('repository conform re-audit found failures', 1)
        })
    )
