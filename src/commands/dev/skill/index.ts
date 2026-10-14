import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import {
  type DevelopmentGenerationEvent,
  type DevelopmentRubricEvent,
  inspectDevelopmentGeneration,
  inspectDevelopmentRubric
} from '../../../core/harness/index.ts'
import { developmentSkillGenerationPort, developmentSkillRubricPort } from '../ports.ts'

const renderRubricEvent = (event: DevelopmentRubricEvent): string => {
  switch (event.kind) {
    case 'written':
      return `write ${event.target}\n`
    case 'in-sync':
      return `ki dev skill rubric: ${event.identity} references/rubric.md is in sync in ${event.root}\n`
    case 'out-of-sync':
      return `ki dev skill rubric: ${event.identity} references/rubric.md ${event.reason} in ${event.root}; run with --write from a dev-linked harness\n`
  }
}

const renderGenerationEvent = (event: DevelopmentGenerationEvent): string => {
  switch (event.kind) {
    case 'written':
      return `write ${event.target}\n`
    case 'in-sync':
      return `ki dev skill generate: ${event.identity} ${event.count} generated surface(s) are in sync in ${event.root}\n`
    case 'out-of-sync':
      return `ki dev skill generate: ${event.identity} ${event.path} ${event.reason} in ${event.root}; run with --write from a dev-linked harness\n`
  }
}

export const createDevSkillCommand = (context: KiContext): Command =>
  new Command('skill')
    .description('development-only skill operations')
    .addCommand(
      new Command('generate')
        .description("render the surfaces a skill's scripts/generate module produces, or verify them on disk")
        .argument('<skill>', 'skill capability name whose generated surfaces to render')
        .option('--write', 'publish the rendered surfaces below the Harness root (dev-linked harness installs only)')
        .action(async (skill: string, options: { write?: boolean }) => {
          await inspectDevelopmentGeneration(
            developmentSkillGenerationPort(context),
            skill,
            { write: Boolean(options.write), workingDirectory: context.workingDirectory },
            (event) => context.stdout.write(renderGenerationEvent(event))
          )
        })
    )
    .addCommand(
      new Command('rubric')
        .description("render a skill's generated rubric catalogue, or verify it against references/rubric.md")
        .argument('<skill>', 'skill capability name whose rubric to render')
        .option('--write', 'publish the rendered catalogue to references/rubric.md (dev-linked harness installs only)')
        .action(async (skill: string, options: { write?: boolean }) => {
          await inspectDevelopmentRubric(
            developmentSkillRubricPort(context),
            skill,
            { write: Boolean(options.write), workingDirectory: context.workingDirectory },
            (event) => context.stdout.write(renderRubricEvent(event))
          )
        })
    )
