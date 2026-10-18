export class KiError extends Error {
  public readonly exitCode: number
  /** The step that puts the error right, rendered on its own `next:` line, where one exists. */
  public readonly next?: string

  public constructor(message: string, exitCode = 1, next?: string) {
    super(message)
    this.name = 'KiError'
    this.exitCode = exitCode
    if (next) this.next = next
  }
}

export class KiExit extends Error {
  public readonly exitCode: number

  public constructor(exitCode: number) {
    super()
    this.name = 'KiExit'
    this.exitCode = exitCode
  }
}

/** An error's message with its next step, for a warning or reason that carries on rather than stops. */
export const errorWithNext = (error: Error): string =>
  error instanceof KiError && error.next ? `${error.message}; ${error.next}` : error.message

export const grammarError = (message: string): KiError => new KiError(message, 2)
