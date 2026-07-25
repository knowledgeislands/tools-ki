import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { readDeclaredSkills } from '../core/configuration.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { runAuditOperation, runConformOperation } from '../core/operation.ts'
import { resolveRepository } from '../core/repository.ts'
import { resolveDeclaredSkills } from '../core/resolution.ts'
import { prepareWrites, publishWrites } from '../core/transaction.ts'

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
          const findings = (await Promise.all(skills.map((skill) => runAuditOperation(repository.root, skill)))).flat()
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
          const results = await Promise.all(skills.map((skill) => runConformOperation(repository.root, skill)))
          const findings = results.flatMap((result) => result.findings)
          const writes = await prepareWrites(
            repository.root,
            results.flatMap((result) => result.writes)
          )
          for (const finding of findings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
          if (findings.some((finding) => finding.level === 'fail')) throw new KiError('native repository conform found failures', 1)
          await publishWrites(writes, Boolean(options.dryRun))
          if (options.dryRun) return
          const auditFindings = (await Promise.all(skills.map((skill) => runAuditOperation(repository.root, skill)))).flat()
          for (const finding of auditFindings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
          if (auditFindings.some((finding) => finding.level === 'fail'))
            throw new KiError('native repository conform re-audit found failures', 1)
        })
    )
