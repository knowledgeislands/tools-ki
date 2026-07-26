import { lstat, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import { inspectUserConfiguration } from '../agents/configuration.ts'
import type { KiContext } from '../context.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { resolveConfiguredUserSkills } from '../core/resolution.ts'
import { detectFixed, runSkillAudit, runSkillConform } from '../core/runtime.ts'
import { prepareScopedWrites, publishWrites } from '../core/transaction.ts'

const resolveUserScope = async (context: KiContext, selected?: string) => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing') throw new KiError('ki user requires configuration; run `ki bootstrap` first', 1)
  if (configuration.state !== 'valid') throw new KiError(`ki user requires valid configuration: ${configuration.errors.join('; ')}`, 1)
  const state = await lstat(context.homeDirectory).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError('user home must be an existing physical directory', 1)
  const userHome = await realpath(context.homeDirectory)
  const harnesses = await discoverInstalledHarnesses(context.paths.data)
  return { userHome, skills: resolveConfiguredUserSkills(configuration.skills, harnesses, selected) }
}

export const createUserCommand = (context: KiContext): Command =>
  new Command('user')
    .description('run native maintenance operations for configured user skills')
    .addCommand(
      new Command('audit')
        .description('run registered native audit operations for configured user skills')
        .option('--skill <capability>', 'one configured resolved skill to audit')
        .action(async (options: { skill?: string }) => {
          const { userHome, skills } = await resolveUserScope(context, options.skill)
          const results = []
          for (const skill of skills) results.push(await runSkillAudit({ kind: 'user-home', userHome }, skill))
          const findings = results.flatMap((result) => result.findings)
          if (!findings.length) context.stdout.write(`ki user audit: clean (${skills.length} skills)\n`)
          for (const finding of findings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          if (findings.some((finding) => finding.level === 'fail')) throw new KiError('native user audit found failures', 1)
        })
    )
    .addCommand(
      new Command('conform')
        .description('apply registered native conform operations for configured user skills')
        .option('--skill <capability>', 'one configured resolved skill to conform')
        .option('--dry-run', 'validate and report without writing')
        .action(async (options: { skill?: string; dryRun?: boolean }) => {
          const { userHome, skills } = await resolveUserScope(context, options.skill)
          const conformed = []
          for (const skill of skills) conformed.push({ skill, conform: await runSkillConform({ kind: 'user-home', userHome }, skill) })
          const findings = conformed.flatMap(({ conform }) => conform.findings)
          const commands = conformed.flatMap(({ conform }) => conform.commands)
          if (commands.length)
            throw new KiError('native user conform does not permit subprocess repairs; declare transactional user-home writes instead', 1)
          const scopedWrites = conformed.flatMap(({ conform }) => {
            if (conform.scope.kind !== 'user-home') throw new KiError('native user conform loaded a non-user scope', 1)
            const scope = conform.scope
            return conform.writes.map((write) => ({ write, scope: { paths: scope.paths } }))
          })
          const writes = await prepareScopedWrites(userHome, scopedWrites)
          for (const finding of findings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
          if (findings.some((finding) => finding.level === 'fail')) throw new KiError('native user conform found failures', 1)
          await publishWrites(writes, Boolean(options.dryRun))
          if (options.dryRun) return
          const reaudited = []
          for (const { skill, conform } of conformed) {
            reaudited.push({ conform, audit: await runSkillAudit({ kind: 'user-home', userHome }, skill) })
          }
          const auditFindings = reaudited.flatMap(({ audit }) => audit.findings)
          for (const finding of auditFindings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          const fixed = reaudited.flatMap(({ conform, audit }) => detectFixed(conform.fixable, audit.items))
          for (const entry of fixed) context.stdout.write(`FIXED ${entry.code}: ${entry.message}\n`)
          if (auditFindings.some((finding) => finding.level === 'fail')) throw new KiError('native user conform re-audit found failures', 1)
        })
    )
