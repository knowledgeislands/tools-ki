import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import { type DevelopmentRubricEvent, inspectDevelopmentRubric } from '../../../core/harness/index.ts'
import { developmentSkillRubricPort } from '../ports.ts'

const renderRubricEvent = (event: DevelopmentRubricEvent): string => {
  switch (event.kind) {
    case 'written':
      return `write ${event.target}\n`
    case 'in-sync':
      return `ki dev skill rubric: ${event.identity} references/rubric.md is in sync\n`
    case 'out-of-sync':
      return `ki dev skill rubric: ${event.identity} references/rubric.md ${event.reason}; run with --write from a dev-linked harness\n`
  }
}

export const createDevSkillCommand = (context: KiContext): Command =>
  new Command('skill').description('development-only skill operations').addCommand(
    new Command('rubric')
      .description("render a skill's generated rubric catalogue, or verify it against references/rubric.md")
      .argument('<skill>', 'skill capability name whose rubric to render')
      .option('--write', 'publish the rendered catalogue to references/rubric.md (dev-linked harness installs only)')
      .action(async (skill: string, options: { write?: boolean }) => {
        await inspectDevelopmentRubric(developmentSkillRubricPort(context), skill, Boolean(options.write), (event) =>
          context.stdout.write(renderRubricEvent(event))
        )
      })
  )
