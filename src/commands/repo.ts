import { Command } from 'commander'
import { readDeclaredSkills } from '../core/configuration.ts'
import type { KiContext } from '../core/context.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'
import { runAuditOperation } from '../core/operation.ts'
import { resolveRepository } from '../core/repository.ts'
import { resolveDeclaredSkills } from '../core/resolution.ts'

export const createRepoCommand = (context: KiContext): Command =>
  new Command('repo').description('run native operations for one KI repository').addCommand(
    new Command('audit')
      .description('run registered native audit operations for declared skills')
      .option('--repo <path>', 'repository root to audit')
      .option('--skill <capability>', 'one declared resolved skill to audit')
      .action(async (options: { repo?: string; skill?: string }) => {
        const repository = await resolveRepository({
          repository: options.repo,
          workingDirectory: context.workingDirectory,
          homeDirectory: context.homeDirectory
        })
        const declarations = await readDeclaredSkills(repository.configuration)
        const harnesses = await discoverInstalledHarnesses(context.paths.data)
        const skills = resolveDeclaredSkills(declarations, harnesses, options.skill)
        const findings = (await Promise.all(skills.map((skill) => runAuditOperation(repository.root, skill)))).flat()
        if (!findings.length) context.stdout.write(`ki repo audit: clean (${skills.length} skills)\n`)
        for (const finding of findings) context.stdout.write(`${finding.level} ${finding.code}: ${finding.message}\n`)
        if (findings.some((finding) => finding.level === 'fail')) throw new KiError('native repository audit found failures', 1)
      })
  )
