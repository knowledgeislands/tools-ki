import type { KiContext } from '../../../../context.ts'
import { heartbeatLine, progressLine, type RenderOptions } from './rendering.ts'

const REFRESH_INTERVAL_MS = 250
const HEARTBEAT_INTERVAL_MS = 60_000
const CLEAR_LINE = '\r\x1b[2K'
const CURSOR_HIDE = '\x1b[?25l'
const CURSOR_SHOW = '\x1b[?25h'

type Placement = RenderOptions['placement']

/**
 * How the display reaches its reader: a live terminal row, one plain line per change, or a
 * heartbeat that names the current activity on standard error once a minute and nothing else.
 */
export type DisplayMode = 'interactive' | 'plain' | 'heartbeat'

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
export const createProgressDisplay = (context: KiContext, labelWidth: number, mode: DisplayMode): ProgressDisplay => {
  const interactive = mode === 'interactive'
  const heartbeat = mode === 'heartbeat'
  const stream = heartbeat ? context.stderr : context.stdout
  let tick = 0
  let current: Activity | undefined
  let liveRow = false
  let temporaryRows = 0
  let cursorHidden = false

  const renderOptions = (label: string, placement: Placement = 'root'): RenderOptions => ({
    columns: stream.columns,
    label: label.padEnd(labelWidth),
    placement,
    tick
  })
  const hideCursor = (): void => {
    if (!interactive || cursorHidden) return
    stream.write(CURSOR_HIDE)
    cursorHidden = true
  }
  const showCursor = (): void => {
    if (!cursorHidden) return
    stream.write(CURSOR_SHOW)
    cursorHidden = false
  }
  const writeLive = (line: string): void => {
    hideCursor()
    stream.write(interactive ? `${CLEAR_LINE}${line}` : `${line}\n`)
    liveRow = interactive
  }
  const renderActivity = (activity: Activity): void => {
    tick += 1
    const options = renderOptions(activity.label)
    writeLive(
      heartbeat
        ? heartbeatLine(activity.text(), options)
        : progressLine({ complete: 0, total: undefined, text: activity.text() }, options)
    )
  }
  const commit = (line: string): void => {
    hideCursor()
    stream.write(`${interactive ? CLEAR_LINE : ''}${line}${interactive ? '\r\n' : '\n'}`)
    liveRow = false
  }
  const releaseInterrupt = context.onInterrupt(() => {
    showCursor()
    if (liveRow) stream.write('\n')
    liveRow = false
  })
  const releaseInterval =
    interactive || heartbeat
      ? context.startInterval(interactive ? REFRESH_INTERVAL_MS : HEARTBEAT_INTERVAL_MS, () => {
          if (current) renderActivity(current)
        })
      : undefined

  return {
    activity: (label, text) => {
      current = { label, text }
      if (!heartbeat) renderActivity(current)
    },
    receipt: (label, text, options = {}) => {
      current = undefined
      if (heartbeat) return
      tick += 1
      commit(progressLine({ complete: 1, total: 1, text }, renderOptions(label, options.placement)))
      if (options.temporary && interactive) temporaryRows += 1
    },
    failure: (label, text, placement = 'root') => {
      current = undefined
      if (heartbeat) return
      tick += 1
      commit(progressLine({ complete: 0, total: 1, text }, renderOptions(label, placement)))
    },
    collapseTemporary: () => {
      current = undefined
      if (!interactive) return
      if (liveRow) stream.write(CLEAR_LINE)
      liveRow = false
      if (!temporaryRows) return
      stream.write(`\x1b[${temporaryRows}A${`${CLEAR_LINE}\r\n`.repeat(temporaryRows)}\x1b[${temporaryRows}A`)
      temporaryRows = 0
    },
    finish: () => {
      releaseInterval?.()
      showCursor()
      releaseInterrupt()
    }
  }
}
