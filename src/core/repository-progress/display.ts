import type { KiContext } from '../../context.ts'
import { progressLine, type RenderOptions } from './rendering.ts'

const REFRESH_INTERVAL_MS = 250
const CLEAR_LINE = '\r\x1b[2K'
const CURSOR_HIDE = '\x1b[?25l'
const CURSOR_SHOW = '\x1b[?25h'

type Placement = RenderOptions['placement']

interface Activity {
  readonly label: string
  readonly text: () => string
}

export interface ProgressDisplay {
  readonly activity: (label: string, text: () => string) => void
  readonly receipt: (
    label: string,
    text: string,
    options?: { readonly placement?: Placement; readonly temporary?: boolean }
  ) => void
  readonly failure: (label: string, text: string, placement?: Placement) => void
  readonly collapseTemporary: () => void
  readonly finish: () => void
}

/** Owns the terminal mechanics for a receipt stream with at most one mutable row. */
export const createProgressDisplay = (
  context: KiContext,
  labelWidth: number,
  interactive: boolean
): ProgressDisplay => {
  let tick = 0
  let current: Activity | undefined
  let liveRow = false
  let temporaryRows = 0
  let cursorHidden = false

  const renderOptions = (label: string, placement: Placement = 'root'): RenderOptions => ({
    columns: context.stdout.columns,
    label: label.padEnd(labelWidth),
    placement,
    tick
  })
  const hideCursor = (): void => {
    if (!interactive || cursorHidden) return
    context.stdout.write(CURSOR_HIDE)
    cursorHidden = true
  }
  const showCursor = (): void => {
    if (!cursorHidden) return
    context.stdout.write(CURSOR_SHOW)
    cursorHidden = false
  }
  const writeLive = (line: string): void => {
    hideCursor()
    context.stdout.write(interactive ? `${CLEAR_LINE}${line}` : `${line}\n`)
    liveRow = interactive
  }
  const renderActivity = (activity: Activity): void => {
    tick += 1
    writeLive(progressLine({ complete: 0, total: undefined, text: activity.text() }, renderOptions(activity.label)))
  }
  const commit = (line: string): void => {
    hideCursor()
    context.stdout.write(`${interactive ? CLEAR_LINE : ''}${line}${interactive ? '\r\n' : '\n'}`)
    liveRow = false
  }
  const releaseInterrupt = context.onInterrupt(() => {
    showCursor()
    if (liveRow) context.stdout.write('\n')
    liveRow = false
  })
  const releaseInterval = interactive
    ? context.startInterval(REFRESH_INTERVAL_MS, () => {
        if (current) renderActivity(current)
      })
    : undefined

  return {
    activity: (label, text) => {
      current = { label, text }
      renderActivity(current)
    },
    receipt: (label, text, options = {}) => {
      current = undefined
      tick += 1
      commit(progressLine({ complete: 1, total: 1, text }, renderOptions(label, options.placement)))
      if (options.temporary && interactive) temporaryRows += 1
    },
    failure: (label, text, placement = 'root') => {
      current = undefined
      tick += 1
      commit(progressLine({ complete: 0, total: 1, text }, renderOptions(label, placement)))
    },
    collapseTemporary: () => {
      current = undefined
      if (!interactive) return
      if (liveRow) context.stdout.write(CLEAR_LINE)
      liveRow = false
      if (!temporaryRows) return
      context.stdout.write(`\x1b[${temporaryRows}A${`${CLEAR_LINE}\r\n`.repeat(temporaryRows)}\x1b[${temporaryRows}A`)
      temporaryRows = 0
    },
    finish: () => {
      releaseInterval?.()
      showCursor()
      releaseInterrupt()
    }
  }
}
