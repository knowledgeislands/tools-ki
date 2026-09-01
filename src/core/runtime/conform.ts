import { KiError } from '../errors.ts'
import type { NativeWrite } from '../filesystem/index.ts'
import { type ConformCommand, RUBRIC_PHASES } from '../rubric/index.ts'
import { auditSkill, findingForOutcome } from './audit.ts'
import type {
  Finding,
  FixedItem,
  ItemAuditState,
  ItemProgress,
  PreparedSkill,
  RuntimeScope,
  SkillConformResult
} from './types.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const validProgram = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export const validateConformProposal = (
  value: unknown,
  identity: string
): { readonly writes: readonly NativeWrite[]; readonly commands: readonly ConformCommand[] } => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric session proposal must return a table`, 1)
  const { writes, commands = [] } = value
  if (!Array.isArray(writes)) throw new KiError(`${identity} rubric session proposal must return a writes array`, 1)
  if (!Array.isArray(commands)) throw new KiError(`${identity} rubric session proposal commands must be an array`, 1)
  const validatedWrites = writes.map((write, index) => {
    if (!isRecord(write))
      throw new KiError(`${identity} rubric session proposal write ${index} must have string path and content`, 1)
    const { path, content, create } = write
    if (typeof path !== 'string' || typeof content !== 'string')
      throw new KiError(`${identity} rubric session proposal write ${index} must have string path and content`, 1)
    if (create !== undefined && typeof create !== 'boolean')
      throw new KiError(`${identity} rubric session proposal write ${index} create must be boolean`, 1)
    return create ? { path, content, create } : { path, content }
  })
  const validatedCommands = commands.map((command, index) => {
    if (!isRecord(command))
      throw new KiError(`${identity} rubric session proposal command ${index} must have a program and arguments`, 1)
    const { program, arguments: arguments_ } = command
    if (typeof program !== 'string' || !validProgram.test(program) || !Array.isArray(arguments_))
      throw new KiError(`${identity} rubric session proposal command ${index} must have a program and arguments`, 1)
    if (arguments_.some((argument) => typeof argument !== 'string' || argument.includes('\0')))
      throw new KiError(
        `${identity} rubric session proposal command ${index} arguments must be strings without NUL bytes`,
        1
      )
    return { program, arguments: arguments_ }
  })
  return { writes: validatedWrites, commands: validatedCommands }
}

const attemptConform = async (
  state: ItemAuditState,
  publication: { write?: NativeWrite; conforming: boolean }
): Promise<boolean> => {
  const { family, item } = state.item
  const conform = item.mechanical.conform as NonNullable<typeof item.mechanical.conform>
  let attempted = false
  for (const audited of state.subjects) {
    const conformable = audited.outcomes.some(
      (outcome) =>
        outcome.status === 'VIOLATION' || (outcome.status === 'INFO' && item.mechanical.conformOn?.includes('INFO'))
    )
    if (!conformable) continue
    const rootContext = await audited.subject.context()
    const context = await family.selectContext(rootContext)
    publication.conforming = true
    try {
      await conform.run(context)
    } finally {
      publication.conforming = false
    }
    attempted = true
  }
  return attempted
}

export const runSkillConform = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  progress?: ItemProgress
): Promise<SkillConformResult> => {
  const { session, items, scope: definitionScope, publication } = await auditSkill(scope, prepared, 'conform', progress)
  const conformOrder = items
    .filter(
      (state) => state.item.item.mechanical.remediation.class === 'automatic' && state.item.item.mechanical.conform
    )
    .slice()
    .sort((left, right) => {
      const phaseDelta =
        RUBRIC_PHASES.indexOf(
          (left.item.item.mechanical.conform as NonNullable<typeof left.item.item.mechanical.conform>).phase
        ) -
        RUBRIC_PHASES.indexOf(
          (right.item.item.mechanical.conform as NonNullable<typeof right.item.item.mechanical.conform>).phase
        )
      if (phaseDelta !== 0) return phaseDelta
      if (left.item.familyIndex !== right.item.familyIndex) return left.item.familyIndex - right.item.familyIndex
      return left.item.itemIndex - right.item.itemIndex
    })
  const attempted = new Set<string>()
  for (const state of conformOrder) if (await attemptConform(state, publication)) attempted.add(state.item.code)

  const findings: Finding[] = []
  const fixable: ItemAuditState[] = []
  const proposal = attempted.size
    ? validateConformProposal(await session.proposal(), prepared.skill.identity)
    : { writes: [] as readonly NativeWrite[], commands: [] as readonly ConformCommand[] }
  const writes =
    attempted.size && publication.write !== undefined ? [...proposal.writes, publication.write] : proposal.writes
  const proposed = writes.length > 0 || proposal.commands.length > 0
  items.forEach((state) => {
    if (proposed && attempted.has(state.item.code)) {
      fixable.push(state)
      return
    }
    for (const outcome of state.outcomes) {
      findings.push(findingForOutcome(state.item, outcome))
    }
  })
  return { findings, writes, commands: proposal.commands, scope: definitionScope, fixable }
}

/** Compares a conform's pre-conform violated items against a post-conform re-audit to name what got fixed. */
export const detectFixed = (
  fixable: readonly ItemAuditState[],
  postItems: readonly ItemAuditState[]
): readonly FixedItem[] => {
  const postByCode = new Map(postItems.map((state) => [state.item.code, state]))
  return fixable.flatMap((state) => {
    const post = postByCode.get(state.item.code)
    // Unreachable via any real CLI path: `postItems` is always a fresh re-audit of the same
    // rubric definition that produced `fixable`, so every fixable item's code is guaranteed
    // to reappear here. Guarded defensively rather than asserted, since detectFixed's inputs
    // are plain data with no type-level link between the two audits.
    /* v8 ignore next */
    if (!post) return []
    if (post.outcomes.some((outcome) => outcome.status === 'VIOLATION')) return []
    const passOutcome = post.outcomes.find((outcome) => outcome.status === 'PASS')
    if (!passOutcome) return []
    return passOutcome.subject === undefined
      ? [{ code: state.item.code, title: state.item.item.title, message: passOutcome.message }]
      : [
          {
            code: state.item.code,
            title: state.item.item.title,
            message: passOutcome.message,
            subject: passOutcome.subject
          }
        ]
  })
}
