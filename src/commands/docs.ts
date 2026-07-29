import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { grammarError } from '../core/errors.ts'

const documentationUrls = {
  overview: 'https://github.com/knowledgeislands/tools-ki',
  manual: 'https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1',
  roadmap: 'https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md'
} as const

type DocumentationTopic = keyof typeof documentationUrls

const documentationUrl = (topic: string | undefined): string => {
  const selected = topic ?? 'overview'
  if (!(selected in documentationUrls)) throw grammarError('docs topic must be overview, manual, or roadmap')
  return documentationUrls[selected as DocumentationTopic]
}

export const createDocsCommand = (context: KiContext): Command =>
  new Command('docs')
    .description('print a canonical KI documentation URL')
    .argument('[topic]', 'overview, manual, or roadmap')
    .action((topic: string | undefined) => context.stdout.write(`${documentationUrl(topic)}\n`))
