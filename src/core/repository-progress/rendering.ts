import { treeProgressPrefix } from '../tree-rendering.ts'

const FALLBACK_TERMINAL_COLUMNS = 80

/** A progress bar distinguishes completed, running, and pending work. */
export interface BarModel {
  readonly complete: number
  readonly started: number
  /** Undefined while the total is not yet known, which renders an animated sweep. */
  readonly total: number | undefined
  readonly text: string
}

export interface RenderOptions {
  readonly columns: number | undefined
  readonly label: string
  readonly placement?: 'root' | 'child' | 'last-child' | 'last-root'
  readonly tick: number
}

export const terminalColumns = (columns: number | undefined): number =>
  columns !== undefined && Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : FALLBACK_TERMINAL_COLUMNS

const truncate = (text: string, width: number): string => {
  if (text.length <= width) return text
  if (width <= 0) return ''
  if (width <= 3) return '.'.repeat(width)
  return `${text.slice(0, width - 3)}...`
}

/** Resolves the boundaries that split a bar into complete, running, and pending zones. */
const barZones = (model: BarModel, width: number, tick: number): readonly [number, number] => {
  if (model.total === undefined) {
    const band = Math.max(1, Math.floor(width / 8))
    const offset = tick % (width + band)
    return [Math.max(0, Math.min(width, offset - band)), Math.max(0, Math.min(width, offset))]
  }
  const total = model.total
  if (total <= 0) return [width, width]
  const scale = (value: number): number => Math.max(0, Math.min(width, Math.round((value / total) * width)))
  const complete = scale(model.complete)
  // An item in flight always occupies at least one column. Without this a run with more
  // items than the bar has columns rounds the band away entirely and shows no work starting.
  if (model.started <= model.complete) return [complete, complete]
  return [Math.min(complete, width - 1), Math.max(Math.min(complete, width - 1) + 1, scale(model.started))]
}

/** Keeps the bar beside its status so all terminal themes expose its three states. */
const bracketBar = (model: BarModel, width: number, tick: number): string => {
  const inner = Math.max(0, width - 2)
  const [completeEnd, startedEnd] = barZones(model, inner, tick)
  return `[${'#'.repeat(completeEnd)}${'>'.repeat(startedEnd - completeEnd)}${'.'.repeat(inner - startedEnd)}]`
}

export const progressLine = (model: BarModel, { columns, label, placement, tick }: RenderOptions): string => {
  const prefix = treeProgressPrefix(label, placement)
  const width = terminalColumns(columns)
  if (width <= prefix.length) return truncate(model.text, width)
  const remaining = width - prefix.length - 1
  // The status text carries the running item, which is the part a reader needs; give the bar the smaller share.
  const barWidth = Math.min(40, Math.floor(remaining / 3))
  if (barWidth < 3) return `${prefix}${truncate(model.text, width - prefix.length)}`
  return `${prefix}${bracketBar(model, barWidth, tick)} ${truncate(model.text, remaining - barWidth)}`.padEnd(width)
}

export const elapsedTenths = (milliseconds: number): number => Math.round(Math.max(0, milliseconds) / 100)
export const formatTenths = (tenths: number): string => `${(tenths / 10).toFixed(1)}s`
export const elapsed = (milliseconds: number): string => formatTenths(elapsedTenths(milliseconds))
