import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { educateRepositories } from '../../core/repository/index.ts'
import { repositoryOperationContext } from './operation-context.ts'
import type { SelectRepositories } from './selection.ts'
import { renderEducation, repositoryOperationProgress } from './shared/index.ts'

export const createRepoEducateCommand = (context: KiContext, selectedRepositories: SelectRepositories): Command =>
  new Command('educate')
    .description('explain maintenance for declared skills')
    .option('--skill <capability>', 'one declared resolved skill to explain')
    .action(async (options: { skill?: string }) => {
      const output = {
        progress: 'auto' as const,
        progressStyle: 'single' as const,
        reporterLevels: [],
        concise: false
      }
      await educateRepositories(
        repositoryOperationContext(context, repositoryOperationProgress(context, output)),
        { ...options, ...selectedRepositories() },
        ({ educations }) => {
          if (!educations.length) context.stdout.write('ki repo educate: no declared skills\n')
          else context.stdout.write(`${educations.flatMap(renderEducation).join('\n')}\n`)
        }
      )
    })
