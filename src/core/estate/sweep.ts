import { lstat, open, readdir, readFile, readlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { EstatePorts, SweepHit, SweepPattern } from './model.ts'

const MAX_BYTES = 4 * 1024 * 1024

interface SweepSource {
  readonly path: string
  readonly depth: number
  readonly name?: RegExp
}

/** Report-only configuration surfaces that later phases own; secrets stores are deliberately absent. */
const sources: readonly SweepSource[] = [
  { path: '.local/share/chezmoi', depth: 12 },
  { path: '.claude/settings.json', depth: 0 },
  { path: '.claude.json', depth: 0 },
  ...['agents', 'skills', 'hooks', 'commands'].map((name) => ({ path: `.claude/${name}`, depth: 4 })),
  { path: '.claude/plugins', depth: 1, name: /\.json$/ },
  { path: '.config/zed/settings.json', depth: 0 },
  { path: '.mcporter/mcporter.json', depth: 0 },
  { path: 'Library/LaunchAgents', depth: 1 },
  { path: '.paperclip/instances', depth: 2, name: /^config\.json$/ },
  { path: '.codex', depth: 1, name: /^(?:config\.toml|AGENTS\.md|instructions\.md)$/ },
  { path: '.codex/rules', depth: 3 },
  { path: '.warp', depth: 3 },
  { path: 'Library/Application Support/dev.warp.Warp-Stable', depth: 1, name: /\.(?:json|toml|ya?ml)$/ },
  { path: '.config/ki', depth: 2 },
  { path: '.local/share/ki/harnesses', depth: 2 }
]

const literal = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const expression = (pattern: SweepPattern): RegExp =>
  pattern.kind === 'path'
    ? new RegExp(`(?<=/)${literal(pattern.value)}(?![A-Za-z0-9_.-])`)
    : new RegExp(`(?<![A-Za-z0-9_.-])${literal(pattern.value)}(?![A-Za-z0-9_-])(?!\\.(?!git\\b)[A-Za-z0-9])`, 'i')

const isText = async (path: string, size: number): Promise<boolean> => {
  if (size > MAX_BYTES) return false
  const handle = await open(path)
  const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(8192) })
  await handle.close()
  return !buffer.subarray(0, bytesRead).includes(0)
}

/**
 * Every remaining occurrence of an old path or renamed identity, as file and line. Symlink
 * targets report line 0. Matched text is never printed, so a secret on the same line stays private.
 */
export const sweepOccurrences = async (
  ports: EstatePorts,
  patterns: readonly SweepPattern[]
): Promise<readonly SweepHit[]> => {
  if (!patterns.length) return []
  const matchers = patterns.map((pattern) => ({ pattern, expression: expression(pattern) }))
  const hits: SweepHit[] = []
  const scan = (file: string, line: number, text: string): void => {
    for (const { pattern, expression: matcher } of matchers)
      if (matcher.test(text)) hits.push({ file, line, match: pattern.value })
  }
  const visit = async (path: string, depth: number, name: RegExp | undefined, top: boolean): Promise<void> => {
    const state = await lstat(path).catch(() => undefined)
    if (!state) return
    if (state.isSymbolicLink()) scan(path, 0, await readlink(path))
    else if (state.isDirectory()) {
      if (!depth) return
      for (const entry of (await readdir(path)).sort())
        if (entry !== '.git' && entry !== 'node_modules') await visit(join(path, entry), depth - 1, name, false)
    } else if ((top || !name || name.test(basename(path))) && (await isText(path, state.size))) {
      const lines = (await readFile(path, 'utf8')).split('\n')
      for (const [index, text] of lines.entries()) scan(path, index + 1, text)
    }
  }
  for (const source of sources) await visit(join(ports.homeDirectory, source.path), source.depth, source.name, true)
  return hits
}
