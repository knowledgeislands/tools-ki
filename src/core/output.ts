export interface Output {
  readonly isTTY?: boolean
  write(chunk: string): void
}
