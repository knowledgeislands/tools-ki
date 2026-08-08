export interface TreeEntry {
  readonly label: string
  readonly continuations?: readonly string[]
  readonly children?: readonly TreeEntry[]
}

export interface TreeReport {
  readonly title: string
  readonly details?: readonly string[]
  readonly entries: readonly TreeEntry[]
}

const TOP_LEFT = '╭─'
const BRANCH = '├─'
const LAST_BRANCH = '╰─'
const VERTICAL = '│  '
const INDENT = '   '

const renderEntries = (entries: readonly TreeEntry[], prefix = ''): readonly string[] =>
  entries.flatMap((entry, index) => {
    const last = index === entries.length - 1
    const childPrefix = `${prefix}${last ? INDENT : VERTICAL}`
    const continuationLines = (entry.continuations ?? []).map((line) => `${childPrefix}${INDENT}${line}`)
    const childLines = renderEntries(entry.children ?? [], childPrefix)

    return [`${prefix}${last ? LAST_BRANCH : BRANCH} ${entry.label}`, ...continuationLines, ...childLines]
  })

/** Renders a semantic CLI report tree while owning every layout character and branching rule. */
export const renderTree = (report: TreeReport): readonly string[] => [
  `${TOP_LEFT} ${report.title}`,
  ...(report.details ?? []).map((detail) => `${VERTICAL}${detail}`),
  ...renderEntries(report.entries)
]
