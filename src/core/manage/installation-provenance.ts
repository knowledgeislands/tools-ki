import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Classify only proven embedded releases or identified, physically resolved development checkouts. */
export function installationProvenance(entrypointUrl: string | undefined): 'local' | 'release' | 'unknown' {
  if (!entrypointUrl) return 'unknown'
  if (entrypointUrl.startsWith('file:///$bunfs/')) return 'release'
  try {
    const entrypoint = realpathSync(fileURLToPath(entrypointUrl))
    const root = dirname(dirname(entrypoint))
    if (entrypoint !== join(root, 'src', 'main.ts') || !statSync(entrypoint).isFile()) return 'unknown'
    const manifest = join(root, 'package.json')
    if (!lstatSync(manifest).isFile() || !lstatSync(join(root, 'bin', 'ki')).isFile()) return 'unknown'
    if (JSON.parse(readFileSync(manifest, 'utf8')).name !== '@knowledgeislands/ki') return 'unknown'
    const git = join(root, '.git')
    const marker = lstatSync(git)
    if (marker.isDirectory()) return 'local'
    if (!marker.isFile()) return 'unknown'
    const pointer = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(readFileSync(git, 'utf8'))?.[1]
    if (!pointer) return 'unknown'
    return statSync(realpathSync(resolve(root, pointer))).isDirectory() ? 'local' : 'unknown'
  } catch {
    return 'unknown'
  }
}
