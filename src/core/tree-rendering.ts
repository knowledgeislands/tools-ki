export interface TreeEntry {
  readonly label: string
  readonly continuation?: readonly string[]
  readonly children?: readonly TreeEntry[]
}

export interface TreeReport {
  readonly title: string
  readonly context?: readonly TreeEntry[]
  readonly entries: readonly TreeEntry[]
}

export interface TreeSection {
  readonly entry: (entry: TreeEntry) => void
}

export interface TreeReporter {
  readonly entry: (entry: TreeEntry) => void
  readonly section: (label: string, entries: number) => TreeSection
  readonly finish: (entry: TreeEntry) => void
}

const TOP_LEFT = '╭─'
const BRANCH = '├─'
const LAST_BRANCH = '╰─'
const VERTICAL = '│  '
const INDENT = '   '

const normalizeLabel = (label: string): string => label.replace(/\s{2,}/g, ' ')

const renderEntry = (entry: TreeEntry, prefix: string, last: boolean): readonly string[] => {
  const childPrefix = `${prefix}${last ? INDENT : VERTICAL}`
  return [
    `${prefix}${last ? LAST_BRANCH : BRANCH} ${normalizeLabel(entry.label)}`,
    ...(entry.continuation ?? []).map((line) => `${childPrefix}${normalizeLabel(line)}`),
    ...renderEntries(entry.children ?? [], childPrefix)
  ]
}

const renderEntries = (entries: readonly TreeEntry[], prefix = ''): readonly string[] =>
  entries.flatMap((entry, index) => {
    const last = index === entries.length - 1
    return renderEntry(entry, prefix, last)
  })

export const treeProgressPrefix = (): string => `${BRANCH} progress `

/** Streams a title, known-count sections, and a terminal summary without exposing tree layout to callers. */
export const createTreeReporter = (
  write: (output: string) => void,
  report: Pick<TreeReport, 'title' | 'context'>
): TreeReporter => {
  write(
    `${[`${TOP_LEFT} ${normalizeLabel(report.title)}`, ...renderEntries(report.context ?? [], VERTICAL)].join('\n')}\n`
  )
  const writeEntry = (entry: TreeEntry, last: boolean, prefix = ''): void =>
    write(`${renderEntry(entry, prefix, last).join('\n')}\n`)
  return {
    entry: (entry) => writeEntry(entry, false),
    section: (label, entries) => {
      writeEntry({ label }, false)
      let written = 0
      return {
        entry: (entry) => {
          written += 1
          writeEntry(entry, written === entries, VERTICAL)
        }
      }
    },
    finish: (entry) => writeEntry(entry, true)
  }
}

/** Renders a semantic CLI report tree while owning every layout character and branching rule. */
export const renderTree = (report: TreeReport): readonly string[] => [
  `${TOP_LEFT} ${normalizeLabel(report.title)}`,
  ...renderEntries(report.context ?? [], VERTICAL),
  ...renderEntries(report.entries)
]
