export interface BoxDrawing {
  readonly horizontal: string
  readonly vertical: string
  readonly topLeft: string
  readonly topRight: string
  readonly bottomLeft: string
  readonly bottomRight: string
  readonly topJoin: string
  readonly bottomJoin: string
  readonly join: string
  readonly leftJoin: string
  readonly rightJoin: string
}

export const roundedBoxDrawing: BoxDrawing = {
  horizontal: '─',
  vertical: '│',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  topJoin: '┬',
  bottomJoin: '┴',
  join: '┼',
  leftJoin: '├',
  rightJoin: '┤'
}

const pad = (value: string, width: number): string => `${value}${' '.repeat(Math.max(0, width - value.length))}`

const rule = (left: string, middle: string, right: string, widths: readonly number[], drawing: BoxDrawing): string =>
  `${left}${widths.map((width) => drawing.horizontal.repeat(width + 2)).join(middle)}${right}`

/** Renders a matrix with a left-aligned label column and right-aligned values. */
export const renderMatrixTable = (
  title: string,
  headings: readonly string[],
  rows: readonly (readonly string[])[],
  total: readonly string[],
  drawing: BoxDrawing = roundedBoxDrawing
): readonly string[] => {
  const contentWidths = headings.map((heading, index) =>
    Math.max(heading.length, ...rows.map((row) => (row[index] as string).length), (total[index] as string).length)
  )
  const extraWidth = Math.max(
    0,
    title.length + 5 - rule(drawing.topLeft, drawing.topJoin, drawing.topRight, contentWidths, drawing).length
  )
  const widths = contentWidths.map((width, index) => (index === 0 ? width + extraWidth : width))
  const tableWidth = rule(drawing.topLeft, drawing.topJoin, drawing.topRight, widths, drawing).length
  const renderRow = (cells: readonly string[]): string =>
    `${drawing.vertical} ${cells
      .map((cell, index) => (index === 0 ? pad(cell, widths[index] as number) : cell.padStart(widths[index] as number)))
      .join(` ${drawing.vertical} `)} ${drawing.vertical}`
  return [
    `${drawing.topLeft}${drawing.horizontal} ${title} ${drawing.horizontal.repeat(tableWidth - title.length - 5)}${drawing.topRight}`,
    renderRow(headings),
    rule(drawing.leftJoin, drawing.join, drawing.rightJoin, widths, drawing),
    ...rows.map(renderRow),
    rule(drawing.leftJoin, drawing.join, drawing.rightJoin, widths, drawing),
    renderRow(total),
    rule(drawing.bottomLeft, drawing.bottomJoin, drawing.bottomRight, widths, drawing)
  ]
}
