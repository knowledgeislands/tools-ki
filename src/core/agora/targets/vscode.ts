import type { OpenTargetAdapter } from './types.ts'

export const vscodeOpenTarget = {
  id: 'vscode',
  failureMessage: 'code failed',
  open: (roots, port) => port.runner('code', ['--new-window', ...roots], port.environment)
} as const satisfies OpenTargetAdapter
