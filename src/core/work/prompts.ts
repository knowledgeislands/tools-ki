import { isSecondaryStateOfPlay, type WorkDefinition, type WorkStatusEntry, workSlug } from './status.ts'

export const AGENT_PROMPTS_SCHEMA = 'ki/agent-prompts/v1' as const

export type ThreadKind = 'state-of-play' | 'secondary' | 'project' | 'regular'

/** One coordination thread of a territory and the exact openers that start or resume it. */
export interface ThreadPrompt {
  readonly id: string
  readonly label: string
  readonly kind: ThreadKind
  /** The main State of play a secondary answers to, or the secondary that covers a Project; null otherwise. */
  readonly parent: string | null
  /** The work's state, or null where its state file cannot be read. */
  readonly state: WorkStatusEntry['state'] | null
  /** The full opener under the `ki-coordination` standard's Opening work. */
  readonly opener: string
  /** The one-line opener for a session already on the contract. */
  readonly rebootstrap: string
}

// The role, steering and first-step lines every opener shares, in the words of the standard's Opening work.
const ROLE =
  'Role: coordinator only. The coordinator never does substantive work itself; every unit of work goes to a detached background agent; an owner message never pre-empts work in flight. Dispatch, decide with me, report; stay responsive.'
const STEERING = 'Steering: my messages steer; stop or abort only when I expressly say so, naming the work.'
const FIRST_STEP = 'First step: follow the Bootstrap in ki-coordination, then give the full re-bootstrap report.'

const opener = (entry: WorkDefinition, label: string, capital: string, main: string | undefined): string => {
  const territory = entry.id.split('.')[0] as string
  const kind = entry.level === 'territory' ? 'territory' : entry.level === 'regular' ? 'regular' : 'Project'
  const scope =
    entry.level === 'regular'
      ? 'Coordinate only this package and its declared scope. This opener selects coordination only when the owner explicitly chooses it; confirm the opening authority and the end condition for a bounded episode. Individual captures remain conversational.'
      : entry.level === 'project'
        ? `Project: ${entry.id.slice(territory.length + 1)}; work only this Project's records.`
        : entry.parent
          ? `Secondary State of play under ${main ?? territory} (${territory}): project management only for the work its work.md covers, within its own cap; the main State of play stays the owner's front door and owns cross-cutting decisions, so route those to it.`
          : 'Project management only: priorities, the Project-work queue (cap three or four), decisions and releases; route real work to Project work.'
  return [
    `Bootstrap as ${entry.id} ${kind} work under ki-coordination.`,
    ROLE,
    `Label: ${label}. Work package: +/_WORK/${entry.id}/ in ${capital}.`,
    scope,
    `Background agents: run substantive work through \`ki agent\` in run \`${workSlug(entry.id)}\`; stay responsive.`,
    STEERING,
    FIRST_STEP
  ].join('\n')
}

const rank: Readonly<Record<ThreadKind, number>> = { 'state-of-play': 0, secondary: 1, project: 2, regular: 3 }

/** Offers eligible packages and their openers; listing never opens a coordinating session. */
export const threadPrompts = (
  work: readonly WorkDefinition[],
  states: ReadonlyMap<string, WorkStatusEntry['state']>,
  capital: string
): readonly ThreadPrompt[] => {
  const labelOf = (entry: WorkDefinition): string => entry.label ?? entry.title
  const main = work.find((entry) => entry.level === 'territory' && !entry.parent)
  const mainLabel = main && labelOf(main)
  const coveredBy = new Map(work.flatMap((entry) => entry.covers.map((covered) => [covered, entry.id] as const)))
  return work
    .filter((entry) => states.get(entry.id) !== 'finished')
    .map((entry): ThreadPrompt => {
      const label = labelOf(entry)
      const kind: ThreadKind =
        entry.level === 'regular'
          ? 'regular'
          : entry.level === 'project'
            ? 'project'
            : isSecondaryStateOfPlay(entry.id)
              ? 'secondary'
              : 'state-of-play'
      return {
        id: entry.id,
        label,
        kind,
        parent: entry.parent ?? coveredBy.get(entry.id) ?? null,
        state: states.get(entry.id) ?? null,
        opener: opener(entry, label, capital, mainLabel),
        rebootstrap: `Re-bootstrap as ${entry.id} under ki-coordination.`
      }
    })
    .sort((left, right) => rank[left.kind] - rank[right.kind] || left.id.localeCompare(right.id))
}
