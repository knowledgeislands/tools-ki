export type PresentationKey =
  | 'status.audit-fail'
  | 'status.fail'
  | 'status.fixed'
  | 'status.info'
  | 'status.not-applicable'
  | 'status.pass'
  | 'status.skip'
  | 'status.unavailable'
  | 'status.warn'
  | 'entity.repository'
  | 'entity.skill'

export interface Presentation {
  readonly label: string
  readonly terminal: string
}

const registry: Readonly<Record<PresentationKey, Presentation>> = {
  'status.audit-fail': { label: 'fail', terminal: '×' },
  'status.fail': { label: 'fail', terminal: '✗' },
  'status.fixed': { label: 'fixed', terminal: '↺' },
  'status.info': { label: 'info', terminal: 'i' },
  'status.not-applicable': { label: 'not applicable', terminal: '–' },
  'status.pass': { label: 'pass', terminal: '✓' },
  'status.skip': { label: 'skip', terminal: '○' },
  'status.unavailable': { label: 'unavailable', terminal: '❌' },
  'status.warn': { label: 'warn', terminal: '!' },
  'entity.repository': { label: 'repository', terminal: '📁' },
  'entity.skill': { label: 'skill', terminal: '✦' }
}

export const presentation = (key: PresentationKey): Presentation => registry[key]

export const presentationText = (key: PresentationKey): string => {
  const item = presentation(key)
  return `${item.terminal} ${item.label}`
}
