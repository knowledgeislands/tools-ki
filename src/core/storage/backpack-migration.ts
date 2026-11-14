import { lstat, readdir, readlink, rename, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The one-release move from the retired harness layout. Until ki 0.17 installed backpacks lived
 * under `<data>/harnesses/`, and a backpack published before 14 November 2026 occupied a slot
 * named `<territory>-agentic-harness`. Every managed skill link is absolute and may still pass
 * through either path, so each move is one rename that leaves a relative link behind under the
 * retired name: the links keep resolving until `ki repair --apply` and `ki repo repair` re-point
 * them, and the next release removes the links.
 */

export const RETIRED_BACKPACKS_FOLDER = 'harnesses'
export const BACKPACKS_FOLDER = 'backpacks'

const retiredSlot = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)-agentic-harness$/

/** The backpack spelling of a retired `*-agentic-harness` slot name, or undefined for any other name. */
export const backpackSlotName = (entry: string): string | undefined => {
  const match = retiredSlot.exec(entry)
  return match ? `${match[1]}-agent-backpack` : undefined
}

const linkText = (path: string): Promise<string | undefined> => readlink(path).catch(() => undefined)

/** Whether `entry` in an owner directory is the alias the slot move left behind for its backpack slot. */
export const isRetiredSlotAlias = async (ownerDirectory: string, entry: string): Promise<boolean> => {
  const name = backpackSlotName(entry)
  return name !== undefined && (await linkText(join(ownerDirectory, entry))) === name
}

/** Removes the retired alias of backpack slot `name`, when the slot move left one. */
export const removeRetiredSlotAlias = async (ownerDirectory: string, name: string): Promise<void> => {
  const entry = name.replace(/-agent-backpack$/, '-agentic-harness')
  if (entry !== name && (await isRetiredSlotAlias(ownerDirectory, entry))) await unlink(join(ownerDirectory, entry))
}

const errorCode = (error: unknown): unknown => (error as NodeJS.ErrnoException).code

const moveFolder = async (dataDirectory: string): Promise<readonly string[]> => {
  const retired = join(dataDirectory, RETIRED_BACKPACKS_FOLDER)
  const current = join(dataDirectory, BACKPACKS_FOLDER)
  const state = await lstat(retired).catch(() => undefined)
  if (!state) return []
  if (!state.isDirectory()) {
    if ((await linkText(retired)) === BACKPACKS_FOLDER) return []
    return [`${retired} is neither a folder nor ki's link to ${current}; ki reads ${current} only, so remove it`]
  }
  try {
    // rename(2) moves the folder whole, and replaces an empty `backpacks` folder but no other entry.
    await rename(retired, current)
  } catch (error) {
    // Only another ki moving the folder between the lstat and the rename reaches this.
    /* v8 ignore next */
    if (errorCode(error) === 'ENOENT') return []
    if (!['ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes(errorCode(error) as string)) throw error
    return [`both ${retired} and ${current} exist; ki reads ${current} only, so merge or remove ${retired}`]
  }
  const moved = `moved installed backpacks from ${retired} to ${current}`
  try {
    await symlink(BACKPACKS_FOLDER, retired)
    return [`${moved}; ${retired} links to it until the next release`]
    /* v8 ignore start -- Only an older ki recreating the folder between the rename and the link reaches this. */
  } catch {
    return [`${moved}, but could not leave ${retired} linking to it; run ki repair --apply and ki repo repair`]
  }
  /* v8 ignore stop */
}

const moveSlots = async (dataDirectory: string): Promise<readonly string[]> => {
  const backpacks = join(dataDirectory, BACKPACKS_FOLDER)
  const notices: string[] = []
  const owners = await readdir(backpacks, { withFileTypes: true }).catch(() => [])
  for (const owner of owners.filter((entry) => entry.isDirectory())) {
    const ownerDirectory = join(backpacks, owner.name)
    for (const entry of await readdir(ownerDirectory)) {
      const name = backpackSlotName(entry)
      if (!name || (await isRetiredSlotAlias(ownerDirectory, entry))) continue
      // A slot under both names is reported by discovery; which one to keep is the operator's call.
      if (await lstat(join(ownerDirectory, name)).catch(() => undefined)) continue
      try {
        await rename(join(ownerDirectory, entry), join(ownerDirectory, name))
        /* v8 ignore start -- Only a concurrent ki moving the same slot first reaches this. */
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue
        throw error
      }
      /* v8 ignore stop */
      await symlink(name, join(ownerDirectory, entry))
      notices.push(
        `renamed installed backpack slot ${owner.name}/${entry} to ${owner.name}/${name}; the old name links to it until the next release`
      )
    }
  }
  return notices
}

/**
 * Moves `<data>/harnesses/` to `<data>/backpacks/` and each retired slot to its backpack name, and
 * returns a notice for each move made or refused. Run before every command that reads the data
 * folder; once both moves are made it only reads two directories.
 */
export const migrateBackpackData = async (dataDirectory: string): Promise<readonly string[]> => [
  ...(await moveFolder(dataDirectory)),
  ...(await moveSlots(dataDirectory))
]
