import type { OpenTargetAdapter } from './types.ts'

export const deltaOpenTarget = {
  id: 'delta',
  failureMessage: 'delta failed',
  open: async (roots, port) => {
    for (const root of roots) {
      const result = await port.runner('delta', ['open', root], port.environment)
      if (result.exitCode) return result
    }
    return { exitCode: 0, output: '' }
  }
} as const satisfies OpenTargetAdapter
