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

export interface PairTableRow {
  readonly left: string
  readonly right: string
  readonly forward: string
  readonly reverse: string
}

const pad = (value: string, width: number): string => `${value}${' '.repeat(Math.max(0, width - value.length))}`

const rule = (left: string, middle: string, right: string, widths: readonly number[], drawing: BoxDrawing): string =>
  `${left}${widths.map((width) => drawing.horizontal.repeat(width + 2)).join(middle)}${right}`

const stacked = (title: string, rows: readonly PairTableRow[], drawing: BoxDrawing): readonly string[] => [
  `${drawing.topLeft}${drawing.horizontal} ${title}`,
  ...rows.flatMap((row, index) => [
    `${index === rows.length - 1 ? drawing.bottomLeft : drawing.leftJoin}${drawing.horizontal} ${row.left} ↔ ${row.right}`,
    `   ${drawing.leftJoin}${drawing.horizontal} ${row.forward}`,
    `   ${drawing.bottomLeft}${drawing.horizontal} ${row.reverse}`
  ])
]

/** Renders paired directional values with endpoint cells that visibly span both direction rows. */
export const renderPairTable = (
  title: string,
  rows: readonly PairTableRow[],
  columns: number | undefined,
  drawing: BoxDrawing = roundedBoxDrawing
): readonly string[] => {
  if (!rows.length)
    return [
      `${drawing.topLeft}${drawing.horizontal} ${title}`,
      `${drawing.bottomLeft}${drawing.horizontal} routes: none`
    ]
  const widths: readonly [number, number, number] = [
    Math.max(...rows.map((row) => row.left.length), 12),
    Math.max(...rows.flatMap((row) => [row.forward.length, row.reverse.length]), 18),
    Math.max(...rows.map((row) => row.right.length), 12)
  ]
  const required = widths.reduce((total, width) => total + width, 0) + 10
  if (columns !== undefined && columns < required) return stacked(title, rows, drawing)
  const [leftWidth, middleWidth, rightWidth] = widths
  return [
    `${drawing.topLeft}${drawing.horizontal} ${title}`,
    rule(drawing.topLeft, drawing.topJoin, drawing.topRight, widths, drawing),
    ...rows.flatMap((row, index) => [
      `${drawing.vertical} ${pad(row.left, leftWidth)} ${drawing.vertical} ${pad(row.forward, middleWidth)} ${drawing.vertical} ${pad(row.right, rightWidth)} ${drawing.vertical}`,
      `${drawing.vertical} ${' '.repeat(leftWidth)} ${drawing.leftJoin}${drawing.horizontal.repeat(middleWidth + 2)}${drawing.rightJoin}${' '.repeat(rightWidth + 2)}${drawing.vertical}`,
      `${drawing.vertical} ${' '.repeat(leftWidth)} ${drawing.vertical} ${pad(row.reverse, middleWidth)} ${drawing.vertical} ${' '.repeat(rightWidth)} ${drawing.vertical}`,
      ...(index === rows.length - 1 ? [] : [rule(drawing.leftJoin, drawing.join, drawing.rightJoin, widths, drawing)])
    ]),
    rule(drawing.bottomLeft, drawing.bottomJoin, drawing.bottomRight, widths, drawing)
  ]
}
