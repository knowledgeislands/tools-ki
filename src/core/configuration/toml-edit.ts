import { parse } from 'smol-toml'
import { isRecord } from './declaration.ts'

/**
 * Text edits to a TOML document that leave every line they do not own untouched, so a file another
 * tool manages, such as a chezmoi-rendered `config.toml`, keeps its comments, blank lines and array
 * layout when `ki` changes one value in it. Each edit re-reads the document's layout first.
 */

interface Header {
  readonly path: readonly string[]
  readonly line: number
}

interface Statement {
  readonly table: readonly string[]
  readonly key: string
  readonly start: number
  readonly end: number
}

interface Layout {
  readonly lines: string[]
  readonly headers: readonly Header[]
  readonly statements: readonly Statement[]
}

const parses = (text: string): boolean => {
  try {
    parse(text)
    return true
  } catch {
    return false
  }
}

/** The key path of a `[table]` or `[[array.table]]` header line, read by the grammar's own parser. */
const headerPath = (line: string): readonly string[] => {
  const path: string[] = []
  let value: unknown = parse(line)
  while (isRecord(value) && Object.keys(value).length) {
    const [key] = Object.keys(value) as [string]
    path.push(key)
    const next: unknown = value[key]
    value = Array.isArray(next) ? next[next.length - 1] : next
  }
  return path
}

/**
 * Splits a document that parses into its table headers and key/value statements. A statement ends
 * at the first line where its text parses on its own, so multi-line arrays and strings stay whole
 * and a line inside them that starts with `[` is never mistaken for a header.
 */
const layout = (text: string): Layout => {
  const lines = text.split('\n')
  const headers: Header[] = []
  const statements: Statement[] = []
  let table: readonly string[] = []
  for (let line = 0; line < lines.length; line += 1) {
    const content = (lines[line] as string).trim()
    if (!content || content.startsWith('#')) continue
    if (content.startsWith('[')) {
      table = headerPath(content)
      headers.push({ path: table, line })
      continue
    }
    // A statement of a parsed document always parses alone; the bound only stops a broken one at the end.
    let end = line
    while (end < lines.length - 1 && !parses(lines.slice(line, end + 1).join('\n'))) end += 1
    const [key] = Object.keys(parse(lines.slice(line, end + 1).join('\n'))) as [string]
    statements.push({ table, key, start: line, end })
    line = end
  }
  return { lines, headers, statements }
}

const samePath = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((segment, index) => segment === right[index])

const within = (path: readonly string[], table: readonly string[]): boolean =>
  samePath(path.slice(0, table.length), table)

// Every key `ki` writes is a bare key, as the configuration renderer has always spelt it.
const renderHeader = (path: readonly string[]): string => `[${path.join('.')}]`

const splice = (lines: string[], start: number, remove: number, insert: readonly string[] = []): string => {
  const next = [...lines]
  next.splice(start, remove, ...insert)
  return next.join('\n')
}

/** The last line any statement or header of `table` or its sub-tables occupies. */
const lastLine = (document: Layout, table: readonly string[]): number =>
  Math.max(
    -1,
    ...document.headers.filter((header) => within(header.path, table)).map((header) => header.line),
    ...document.statements.filter((statement) => within(statement.table, table)).map((statement) => statement.end)
  )

/** Inserts a new `[table]` holding `statement` after the last line its parent table occupies. */
const insertTable = (document: Layout, table: readonly string[], statement: readonly string[]): string =>
  splice(document.lines, lastLine(document, table.slice(0, -1)) + 1, 0, ['', renderHeader(table), ...statement])

/** Sets `key` in `[table]`, replacing its statement in place or adding it after the table's last one. */
const setStatement = (
  text: string,
  table: readonly string[],
  key: string,
  render: (layout: { readonly indent: string; readonly singleLine: boolean }) => readonly string[]
): string => {
  const document = layout(text)
  const existing = document.statements.find((statement) => samePath(statement.table, table) && statement.key === key)
  if (existing) {
    const line = document.lines[existing.start] as string
    const indent = line.slice(0, line.length - line.trimStart().length)
    return splice(
      document.lines,
      existing.start,
      existing.end - existing.start + 1,
      render({ indent, singleLine: existing.start === existing.end })
    )
  }
  const header = document.headers.find((candidate) => samePath(candidate.path, table))
  const added = render({ indent: '', singleLine: false })
  if (!header) return insertTable(document, table, added)
  const last = Math.max(
    header.line,
    ...document.statements.filter((statement) => samePath(statement.table, table)).map((statement) => statement.end)
  )
  return splice(document.lines, last + 1, 0, added)
}

/** Sets `key` in `[table]` to a string array, keeping a single-line array on one line. */
export const setTomlStringArray = (
  text: string,
  table: readonly string[],
  key: string,
  values: readonly string[]
): string =>
  setStatement(text, table, key, ({ indent, singleLine }) =>
    singleLine
      ? [`${indent}${key} = [${values.map((value) => JSON.stringify(value)).join(', ')}]`]
      : [`${indent}${key} = [`, ...values.map((value) => `${indent}  ${JSON.stringify(value)},`), `${indent}]`]
  )

/** Sets `key` in `[table]` to a string. */
export const setTomlString = (text: string, table: readonly string[], key: string, value: string): string =>
  setStatement(text, table, key, ({ indent }) => [`${indent}${key} = ${JSON.stringify(value)}`])

/** Adds an empty `[table]` header to a document that has none. */
export const addTomlTable = (text: string, table: readonly string[]): string => insertTable(layout(text), table, [])

/** Removes `[table]` and its sub-tables: each header, its statements and one blank line before it. */
export const removeTomlTable = (text: string, table: readonly string[]): string => {
  for (;;) {
    const document = layout(text)
    const index = document.headers.findIndex((header) => within(header.path, table))
    const header = document.headers[index]
    if (!header) return text
    const next = document.headers[index + 1]?.line ?? document.lines.length
    const end = Math.max(
      header.line,
      ...document.statements
        .filter((statement) => statement.start > header.line && statement.start < next)
        .map((statement) => statement.end)
    )
    const start = document.lines[header.line - 1]?.trim() === '' ? header.line - 1 : header.line
    text = splice(document.lines, start, end - start + 1)
  }
}
