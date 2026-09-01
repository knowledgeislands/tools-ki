import { lstat, readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KiError } from '../../errors.ts'
import type { ObservedTargetRoot, ObserveTargetAdapter, OpenTargetAdapter } from './types.ts'

const table = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const workspaceError = (selector: string, message: string): KiError =>
  new KiError(`VS Code workspace ${selector} ${message}`, 1)
const withoutJsonComments = (source: string): string => {
  let output = ''
  let index = 0
  let quoted = false
  let escaped = false
  while (index < source.length) {
    const character = source[index] as string
    const next = source[index + 1]
    if (quoted) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      index += 1
      continue
    }
    if (character === '"') {
      quoted = true
      output += character
      index += 1
      continue
    }
    if (character === '/' && next === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (character === '/' && next === '*') {
      index += 2
      let closed = false
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') output += '\n'
        index += 1
      }
      if (index < source.length) closed = true
      index += 2
      if (!closed) throw new SyntaxError('unterminated JSONC block comment')
      continue
    }
    output += character
    index += 1
  }
  return output
}
const withoutTrailingCommas = (source: string): string => {
  let output = ''
  let quoted = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string
    if (quoted) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    if (character === ',') {
      let next = index + 1
      while (/\s/u.test(source[next] ?? '')) next += 1
      if (source[next] === '}' || source[next] === ']') continue
    }
    output += character
  }
  return output
}
const parseJsonc = (source: string): unknown => JSON.parse(withoutTrailingCommas(withoutJsonComments(source)))

const folderRoot = (selector: string, value: unknown): ObservedTargetRoot => {
  const folder = table(value)
  if (!folder) throw workspaceError(selector, 'folders must contain path or URI records')
  const path = folder['path']
  const uri = folder['uri']
  if (typeof path === 'string' && uri === undefined)
    return { kind: 'path', value: isAbsolute(path) ? path : resolve(dirname(selector), path) }
  if (typeof uri !== 'string' || path !== undefined)
    throw workspaceError(selector, 'folders must contain exactly one string path or URI')
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw workspaceError(selector, `contains invalid folder URI ${uri}`)
  }
  if (parsed.protocol !== 'file:') return { kind: 'external', value: uri }
  try {
    return { kind: 'path', value: fileURLToPath(parsed) }
  } catch {
    throw workspaceError(selector, `contains invalid physical folder URI ${uri}`)
  }
}

const observeVsCodeWorkspace = async (
  selector: string
): Promise<{ readonly source: string; readonly roots: readonly ObservedTargetRoot[] }> => {
  if (!isAbsolute(selector) || extname(selector) !== '.code-workspace')
    throw new KiError('VS Code --workspace must be an absolute .code-workspace file', 2)
  const state = await lstat(selector).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink())
    throw new KiError(`VS Code workspace selector must be a physical file: ${selector}`, 2)
  let document: unknown
  try {
    document = parseJsonc(await readFile(selector, 'utf8'))
  } catch {
    throw workspaceError(selector, 'must contain valid JSON with comments')
  }
  const workspace = table(document)
  if (!workspace || !Array.isArray(workspace['folders'])) throw workspaceError(selector, 'must contain a folders array')
  return { source: selector, roots: workspace['folders'].map((folder) => folderRoot(selector, folder)) }
}

export const vscodeOpenTarget = {
  id: 'vscode',
  failureMessage: 'code failed',
  open: (roots, port) => port.runner('code', ['--new-window', ...roots], port.environment),
  observe: observeVsCodeWorkspace
} as const satisfies OpenTargetAdapter & ObserveTargetAdapter
