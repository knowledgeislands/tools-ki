import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { grammarError } from '../core/errors.ts'

const documentationUrls = {
  overview: 'https://knowledgeislands.info/tooling/cli/',
  site: 'https://knowledgeislands.info/',
  manual: 'https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1',
  roadmap: 'https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md'
} as const

type DocumentationTopic = keyof typeof documentationUrls

const allDocumentationUrls = (): string =>
  Object.entries(documentationUrls)
    .map(([topic, url]) => `${topic.slice(0, 1).toUpperCase()}${topic.slice(1)}: ${url}`)
    .join('\n')

const documentationUrl = (topic: string): string => {
  if (!(topic in documentationUrls)) throw grammarError('docs topic must be overview, site, manual, or roadmap')
  return documentationUrls[topic as DocumentationTopic]
}

export const createDocsCommand = (context: KiContext): Command =>
  new Command('docs')
    .description('print canonical KI documentation locations')
    .argument('[topic]', 'overview, site, manual, or roadmap')
    .action((topic: string | undefined) => context.stdout.write(`${topic ? documentationUrl(topic) : allDocumentationUrls()}\n`))
