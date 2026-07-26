import { spawn } from 'node:child_process'
import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { readDeclaredSkills } from '../core/configuration.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { resolveRepository } from '../core/repository.ts'
import { resolveDeclaredSkills } from '../core/resolution.ts'
import { detectFixed, runSkillAudit, runSkillConform } from '../core/runtime.ts'
import { prepareWrites, publishWrites } from '../core/transaction.ts'

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

const runCommands = async (repository: string, commands: readonly { readonly program: string; readonly arguments: readonly string[] }[]): Promise<void> => {
  for (const command of commands) {
    const { exitCode, stdout, stderr } = await runCommand(repository, command)
    if (exitCode === 0) continue
    const detail = [stdout, stderr].filter(Boolean).join('\n').trim()
    throw new KiError(`native subprocess repair failed: ${renderCommand(command)}${detail ? `\n${detail}` : ''}`, 1)
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

const progressLine = (operation: string, complete: number, total: number): string => {
  const width = 20
  const filled = Math.round((complete / total) * width)
  return `\rki repo ${operation}: [${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${complete}/${total}`
}

const runWithProgress = async <Skill, Result>(
  context: KiContext,
  operation: string,
  skills: readonly Skill[],
  run: (skill: Skill) => Promise<Result>
): Promise<Result[]> => {
  const interactive = context.stderr.isTTY === true && skills.length > 0
  const results: Result[] = []
  if (interactive) context.stderr.write(progressLine(operation, 0, skills.length))
  try {
    for (const skill of skills) {
      results.push(await run(skill))
      if (interactive) context.stderr.write(progressLine(operation, results.length, skills.length))
    }
  } catch (error) {
    if (interactive) context.stderr.write('\n')
    throw error
  }
  if (interactive) context.stderr.write('\n')
  return results
}

export const createRepoCommand = (context: KiContext): Command =>
  new Command('repo')
    .description('run native operations for one KI repository')
    .addCommand(
      new Command('audit')
        .description('run registered native audit operations for declared skills')
        .option('--repo <path>', 'repository root to audit')
        .option('--skill <capability>', 'one declared resolved skill to audit')
        .action(async (options: { repo?: string; skill?: string }) => {
          const { repository, skills } = await resolveSkills(context, options)
          const results = await runWithProgress(context, 'audit', skills, (skill) => runSkillAudit(repository.root, skill))
          const findings = results.flatMap((result) => result.findings)
          if (!findings.length) context.stdout.write(`ki repo audit: clean (${skills.length} skills)\n`)
          for (const finding of findings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          if (findings.some((finding) => finding.level === 'fail')) throw new KiError('native repository audit found failures', 1)
        })
    )
    .addCommand(
      new Command('conform')
        .description('apply registered native conform operations for declared skills')
        .option('--repo <path>', 'repository root to conform')
        .option('--skill <capability>', 'one declared resolved skill to conform')
        .option('--dry-run', 'validate and report without writing')
        .action(async (options: { repo?: string; skill?: string; dryRun?: boolean }) => {
          const { repository, skills } = await resolveSkills(context, options)
          const conformed = await runWithProgress(context, 'conform', skills, async (skill) => ({
            skill,
            conform: await runSkillConform(repository.root, skill)
          }))
          const findings = conformed.flatMap(({ conform }) => conform.findings)
          const writes = await prepareWrites(
            repository.root,
            conformed.flatMap(({ conform }) => conform.writes)
          )
          const commands = conformed.flatMap(({ conform }) => conform.commands)
          for (const finding of findings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
          for (const command of commands) context.stdout.write(`${options.dryRun ? 'would run' : 'run'} ${renderCommand(command)}\n`)
          if (findings.some((finding) => finding.level === 'fail')) throw new KiError('native repository conform found failures', 1)
          await publishWrites(writes, Boolean(options.dryRun))
          if (options.dryRun) return
          await runCommands(repository.root, commands)
          const reaudited = await runWithProgress(context, 're-audit', conformed, async ({ skill, conform }) => ({
            conform,
            audit: await runSkillAudit(repository.root, skill)
          }))
          const auditFindings = reaudited.flatMap(({ audit }) => audit.findings)
          for (const finding of auditFindings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          const fixed = reaudited.flatMap(({ conform, audit }) => detectFixed(conform.fixable, audit.items))
          for (const entry of fixed) context.stdout.write(`FIXED ${entry.code}: ${entry.message}\n`)
          if (auditFindings.some((finding) => finding.level === 'fail')) throw new KiError('native repository conform re-audit found failures', 1)
        })
    )
