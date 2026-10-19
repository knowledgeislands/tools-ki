/**
 * The deterministic commit-message rules `ki-git` binds, as its canonical Commitlint configuration
 * carries them over `@commitlint/config-conventional`. Judgment rules stay with `ki-git`.
 */
export const messageTypes = ['chore', 'docs', 'feat', 'fix', 'refactor', 'test'] as const

/** A failed rule, named as Commitlint names it, with the reason and the step that puts it right. */
export interface MessageFailure {
  readonly rule: string
  readonly reason: string
  readonly remedy: string
}

const scissors = '# ------------------------ >8 ------------------------'

/** Headers Git generates, which Commitlint's default ignores also pass. */
const generated = [
  /^Merge (branch|tag|remote-tracking branch|pull request) /,
  /^Merge .+ into /,
  /^(Revert|Reapply) /,
  /^(fixup|squash|amend)! /
]

const header = /^(?<type>[^():!\s]*)(?:\((?<scope>[^()]*)\))?!?: (?<subject>.*)$/
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const form = 'write the header as type(scope): subject, or type: subject'

/** The message Git commits: everything before a scissors line, without comment lines. */
const committed = (text: string): readonly string[] => {
  const lines = text.split(/\r?\n/)
  const cut = lines.indexOf(scissors)
  return (cut === -1 ? lines : lines.slice(0, cut)).filter((line) => !line.startsWith('#'))
}

/** The first rule the message breaks, or undefined when it passes. */
export const checkMessage = (text: string): MessageFailure | undefined => {
  const first = committed(text).find((line) => line.trim() !== '')
  if (first === undefined)
    return { rule: 'header-empty', reason: 'the message is empty', remedy: 'write a Conventional Commit header' }
  if (generated.some((pattern) => pattern.test(first))) return undefined
  const parts = header.exec(first)?.groups
  if (!parts) return { rule: 'header-format', reason: `'${first}' is not a Conventional Commit header`, remedy: form }
  const { type = '', scope, subject = '' } = parts
  if (!(messageTypes as readonly string[]).includes(type))
    return {
      rule: 'type-enum',
      reason: `type '${type}' is not one of ${messageTypes.join(', ')}`,
      remedy: 'use one of the permitted types'
    }
  if (scope !== undefined && !scope.split(/[/,]/).every((segment) => kebab.test(segment.trim())))
    return {
      rule: 'scope-case',
      reason: `scope '${scope}' is not lowercase kebab-case`,
      remedy: 'write the scope in lowercase kebab-case'
    }
  if (!subject.trim()) return { rule: 'subject-empty', reason: 'the subject is empty', remedy: form }
  if (subject.trimEnd().endsWith('.'))
    return {
      rule: 'subject-full-stop',
      reason: 'the subject ends with a full stop',
      remedy: 'drop the full stop'
    }
  return undefined
}
