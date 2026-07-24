export class KiError extends Error {
  public readonly exitCode: number

  public constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'KiError'
    this.exitCode = exitCode
  }
}

export const grammarError = (message: string): KiError => new KiError(message, 2)
