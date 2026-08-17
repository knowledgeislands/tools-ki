export type PresentationKey =
  | 'trade.kind.work'
  | 'trade.kind.knowledge'
  | 'trade.observation.complete'
  | 'trade.observation.pending'
  | 'trade.observation.receipt'
  | 'trade.observation.release'
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
  readonly lucide?: 'book-open' | 'hammer'
  readonly svgPaths?: readonly string[]
}

const registry: Readonly<Record<PresentationKey, Presentation>> = {
  'trade.kind.work': {
    label: 'work',
    terminal: '⚒',
    lucide: 'hammer',
    svgPaths: [
      'm15 12-8.373 8.373a1 1 0 1 1-1.414-1.414L13.586 10.586',
      'm18 15 4-4',
      'm21.5 12.5-6-6',
      'm20 8 2-2',
      'm17 5 2-2',
      'M3 21 2 22'
    ]
  },
  'trade.kind.knowledge': {
    label: 'knowledge',
    terminal: 'ⓘ',
    lucide: 'book-open',
    svgPaths: [
      'M12 7v14',
      'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4z'
    ]
  },
  'trade.observation.complete': { label: 'completion', terminal: '…' },
  'trade.observation.pending': { label: 'decision', terminal: '?' },
  'trade.observation.receipt': { label: 'receipt', terminal: '↓' },
  'trade.observation.release': { label: 'release', terminal: '✓' },
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
