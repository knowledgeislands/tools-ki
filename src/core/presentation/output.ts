export interface Output {
  readonly isTTY?: boolean
  readonly columns?: number
  write(chunk: string): void
}
