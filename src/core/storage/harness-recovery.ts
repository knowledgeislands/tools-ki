import { lstat, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { discoverInstallOrphans, type InstallOrphan } from '../harness/index.ts'

export interface OrphanRecovery {
  readonly orphan: InstallOrphan
  readonly action: 'restore' | 'remove' | 'refuse'
  readonly detail: string
}

// Decides what an orphan deserves without doing it, so a dry run and a real run agree by
// construction. A parked payload is only ever removed once its destination is present again:
// while the destination is absent it is the sole verified copy of that harness.
const plannedRecovery = async (dataDirectory: string, orphan: InstallOrphan): Promise<OrphanRecovery> => {
  if (orphan.kind === 'staging')
    return { orphan, action: 'remove', detail: 'unpromoted extraction from an interrupted install' }
  if (!orphan.destination)
    return { orphan, action: 'refuse', detail: 'parked payload does not name the harness it replaced' }
  const destination = join(dataDirectory, 'harnesses', orphan.owner, orphan.destination)
  const present = await lstat(destination).catch(() => undefined)
  return present
    ? { orphan, action: 'remove', detail: `${orphan.owner}/${orphan.destination} is installed` }
    : { orphan, action: 'restore', detail: `restores ${orphan.owner}/${orphan.destination}` }
}

export const planOrphanRecovery = async (dataDirectory: string): Promise<readonly OrphanRecovery[]> => {
  const orphans = await discoverInstallOrphans(dataDirectory)
  return Promise.all(orphans.map((orphan) => plannedRecovery(dataDirectory, orphan)))
}

export const recoverInstallOrphans = async (
  dataDirectory: string,
  planned: readonly OrphanRecovery[]
): Promise<readonly OrphanRecovery[]> => {
  for (const recovery of planned) {
    if (recovery.action === 'restore')
      await rename(
        recovery.orphan.path,
        join(dataDirectory, 'harnesses', recovery.orphan.owner, recovery.orphan.destination as string)
      )
    if (recovery.action === 'remove') await rm(recovery.orphan.path, { recursive: true, force: true })
  }
  return planned
}
