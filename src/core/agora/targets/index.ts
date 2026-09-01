import type { OpenTargetOptions, OpenTargetPort } from './types.ts'
import { vscodeOpenTarget } from './vscode.ts'
import { zedOpenTarget } from './zed.ts'

const openTargets = {
  [zedOpenTarget.id]: zedOpenTarget,
  [vscodeOpenTarget.id]: vscodeOpenTarget
} as const

export type OpenTargetName = keyof typeof openTargets

export const openTargetNames = Object.keys(openTargets) as OpenTargetName[]

export interface OpenTargetResult {
  readonly exitCode: number
  readonly output: string
  readonly failureMessage: string
}

export const openLocalTarget = async (
  target: OpenTargetName,
  roots: readonly string[],
  port: OpenTargetPort,
  options: OpenTargetOptions = {}
): Promise<OpenTargetResult> => {
  const adapter = openTargets[target]
  const result = await adapter.open(roots, port, options)
  return { ...result, failureMessage: adapter.failureMessage }
}
