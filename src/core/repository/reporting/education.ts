import type { educateSkill } from '../../runtime/index.ts'

export const renderEducation = (education: Awaited<ReturnType<typeof educateSkill>>): string[] => [
  education.identity,
  `  Concern: ${education.concern}`,
  `  Scope: ${education.scope.kind === 'repository' ? 'repository' : `user home (${education.scope.paths.join(', ')})`}`,
  ...education.families.flatMap((family) => [
    `  ${family.code}: ${family.title}`,
    `    ${family.description}`,
    `    Standard: ${family.standard}`,
    ...family.items.flatMap((item) => {
      const aspects = [
        ...(item.mechanical ? [item.mechanical.heuristic ? 'M-heuristic' : 'M'] : []),
        ...(item.judgment ? ['J'] : [])
      ].join(' + ')
      return [
        `    ${item.code} [${aspects}]: ${item.title}`,
        `      ${item.description}`,
        `      Sources: ${item.sources.join(', ')}`,
        ...(item.judgment ? [`      Review: ${item.judgment.prompt}`] : [])
      ]
    })
  ])
]
