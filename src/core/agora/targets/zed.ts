import type { OpenTargetAdapter } from './types.ts'

export const zedOpenTarget = {
  id: 'zed',
  failureMessage: 'zed failed',
  open: async (roots, port, options) => {
    const window = await port.runner('zed', ['-n'], port.environment)
    if (window.exitCode) return window

    const orderedRoots = options.preserveProjectionOrder ? [...roots].reverse() : roots
    for (const root of orderedRoots) {
      const result = await port.runner('zed', ['-e', root], port.environment)
      if (result.exitCode) return result
    }

    return { exitCode: 0, output: '' }
  }
} as const satisfies OpenTargetAdapter
