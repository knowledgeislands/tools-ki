import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import type { AgentContext, AuthorityTier } from './context.ts'
import { runDirectory } from './context.ts'
import { type AttemptIdentity, canonical, loadControl, verifyStore } from './control-store.ts'
import type { AgentRole, ModelBinding } from './launch-evidence.ts'
import type { AgentEffort, AgentRuntime } from './runtimes.ts'

export { type AgentRole, agentRoles } from './launch-evidence.ts'

const profileRevision = 'ki/agent-profiles/v1-dormant'
const profiles: Record<
  AgentRole,
  { runtime: AgentRuntime; profile: string; effort: AgentEffort; rules: AuthorityTier }
> = {
  mechanical: { runtime: 'codex', profile: 'codex-standard', effort: 'medium', rules: 'none' },
  plan: { runtime: 'codex', profile: 'codex-strongest', effort: 'high', rules: 'none' },
  build: { runtime: 'claude', profile: 'claude-worker', effort: 'high', rules: 'none' },
  review: { runtime: 'codex', profile: 'codex-strongest', effort: 'high', rules: 'none' },
  accept: { runtime: 'codex', profile: 'codex-strongest', effort: 'high', rules: 'none' },
  prune: { runtime: 'claude', profile: 'claude-worker', effort: 'high', rules: 'prune' },
  release: { runtime: 'claude', profile: 'claude-worker', effort: 'high', rules: 'release' }
}
export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

export interface AuthorityReference {
  readonly reference: string
  readonly path: string
  readonly heading: string
  readonly sha256: string
}
export const authorityReference = async (context: AgentContext, reference: string): Promise<AuthorityReference> => {
  const split = reference.lastIndexOf('#')
  if (split < 1 || split === reference.length - 1)
    throw new KiError('authority-unverified: cite an existing local path#heading', 1)
  const path = resolve(context.workingDirectory, reference.slice(0, split))
  const heading = reference.slice(split + 1)
  const text = await readFile(path, 'utf8').catch(() => undefined)
  if (text === undefined) throw new KiError('authority-unverified: the cited local file is unavailable', 1)
  const headings = [...text.matchAll(/^(#{1,6}) (.+)$/gm)]
  const matches = headings.filter(
    (match) =>
      match[2] === heading ||
      match[2]
        ?.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-') === heading
  )
  if (matches.length !== 1) throw new KiError('authority-unverified: missing or ambiguous heading', 1)
  const found = matches[0] as RegExpExecArray
  const end =
    headings.find(
      (match) =>
        (match.index as number) > (found.index as number) && (match[1] as string).length <= (found[1] as string).length
    )?.index ?? text.length
  return { reference, path: await realpath(path), heading, sha256: sha256(text.slice(found.index, end)) }
}

export interface SelectionRequest {
  readonly runtime: AgentRuntime
  readonly model?: string | undefined
  readonly effort?: AgentEffort | undefined
  readonly rules: AuthorityTier
  readonly allow?: readonly string[] | undefined
  readonly role?: AgentRole | undefined
  readonly authority?: string | undefined
  readonly acceptance?: string | undefined
  readonly explicitRuntime?: boolean | undefined
  readonly explicitRules?: boolean | undefined
  readonly selection?: EffectiveSelection | undefined
}
export interface EffectiveSelection {
  readonly schema: 'ki/agent-launch/v1'
  readonly path: 'legacy' | 'role'
  readonly role?: AgentRole | undefined
  readonly runtime: AgentRuntime
  readonly model?: string | undefined
  readonly effort?: AgentEffort | undefined
  readonly rules: AuthorityTier
  readonly grants: readonly string[]
  readonly sources: Readonly<Record<string, 'explicit' | 'profile' | 'legacy' | 'unresolved'>>
  readonly profileRevision: string
  readonly profile?: string | undefined
  readonly authority?: AuthorityReference | undefined
  readonly acceptance?: unknown
  readonly acceptanceWordingRevision?: string | undefined
  readonly acceptanceSupplement?: string | undefined
  readonly binding?: ModelBinding | undefined
  readonly alternative?: boolean | undefined
  readonly refusals: readonly string[]
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const shape = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

const acceptanceEvidence = async (
  context: AgentContext,
  path: string,
  authority: AuthorityReference | undefined
): Promise<unknown> => {
  const text = await readFile(resolve(context.workingDirectory, path), 'utf8').catch(() => undefined)
  let document: unknown
  try {
    document = JSON.parse(text ?? '')
  } catch {
    throw new KiError('acceptance-unverified: invalid declaration JSON', 1)
  }
  if (
    !shape(document, ['schema', 'authority', 'authority_sha256', 'override', 'records']) ||
    document['schema'] !== 'ki/agent-acceptance/v1' ||
    document['override'] !== 'accept-named-records-only' ||
    document['authority'] !== authority?.reference ||
    document['authority_sha256'] !== authority?.sha256 ||
    !Array.isArray(document['records']) ||
    document['records'].length === 0
  )
    throw new KiError('acceptance-unverified: invalid closed declaration or authority digest', 1)
  const ids = new Set<string>()
  const digest = async (path: unknown, expected: unknown): Promise<void> => {
    if (
      typeof path !== 'string' ||
      !isAbsolute(path) ||
      typeof expected !== 'string' ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      throw new KiError('acceptance-unverified: absolute paths and SHA-256 digests required', 1)
    const text = await readFile(path, 'utf8').catch(() => undefined)
    if (text === undefined || sha256(text) !== expected)
      throw new KiError('acceptance-unverified: changed or missing record/review', 1)
  }
  const recorded = async (value: unknown): Promise<{ key: string; attempt: AttemptIdentity; current: boolean }> => {
    if (
      !shape(value, ['run', 'agent', 'attempt', 'token']) ||
      typeof value['run'] !== 'string' ||
      typeof value['agent'] !== 'string'
    )
      throw new KiError('acceptance-unverified: exact recorded attempt identities required', 1)
    const store = await loadControl(runDirectory(context, value['run']))
    if (!store) throw new KiError('acceptance-unverified: unknown review/delivery identity', 1)
    await verifyStore(context, value['run'], store)
    const attempt = Object.values(store.operations)
      .filter((operation) => operation.operation === 'spawn' && operation.receipt?.outcome === 'started')
      .map((operation) => operation.target as AttemptIdentity)
      .find(
        (attempt) =>
          attempt.agent === value['agent'] && attempt.attempt === value['attempt'] && attempt.token === value['token']
      )
    if (!attempt) throw new KiError('acceptance-unverified: unknown review/delivery identity', 1)
    return {
      key: `${value['run']}/${value['agent']}/${value['attempt']}/${value['token']}`,
      attempt,
      current: store.attempts[attempt.agent]?.token === attempt.token
    }
  }
  for (const record of document['records']) {
    if (
      !shape(record, ['id', 'path', 'sha256', 'reviews']) ||
      typeof record['id'] !== 'string' ||
      !/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(record['id']) ||
      ids.has(record['id']) ||
      !Array.isArray(record['reviews']) ||
      !record['reviews'].length
    )
      throw new KiError('acceptance-unverified: named unique records and reviews required', 1)
    ids.add(record['id'])
    await digest(record['path'], record['sha256'])
    const id = /^id:\s*(\S+)\s*$/m.exec(await readFile(record['path'] as string, 'utf8'))?.[1]
    if (id !== record['id']) throw new KiError('acceptance-unverified: record ID mismatch', 1)
    for (const review of record['reviews']) {
      if (!shape(review, ['path', 'sha256', 'reviewer_attempt', 'delivery_attempt']))
        throw new KiError('acceptance-unverified: invalid review shape', 1)
      await digest(review['path'], review['sha256'])
      const reviewer = await recorded(review['reviewer_attempt'])
      const delivery = await recorded(review['delivery_attempt'])
      if (reviewer.key === delivery.key)
        throw new KiError('acceptance-unverified: reviewer and delivery are not independent', 1)
      const directory = runDirectory(context, reviewer.attempt.run)
      const paths: string[] = reviewer.current
        ? [
            join(reviewer.attempt.workHome, `${reviewer.attempt.agent}.report.md`),
            join(directory, `${reviewer.attempt.agent}.report.md`)
          ]
        : []
      for (const folder of (await readdir(directory)).filter((name) =>
        name.startsWith(`${reviewer.attempt.agent}.prev-`)
      )) {
        const text = await readFile(join(directory, folder, `${reviewer.attempt.agent}.launch.json`), 'utf8')
        const archived = JSON.parse(text) as { identity?: AttemptIdentity }
        if (archived.identity?.token === reviewer.attempt.token)
          paths.push(join(directory, folder, `${reviewer.attempt.agent}.report.md`))
      }
      const reports = await Promise.all(paths.map((path) => realpath(path).catch(() => undefined)))
      if (!reports.includes(await realpath(review['path'] as string)))
        throw new KiError('acceptance-unverified: report does not belong to the recorded reviewer', 1)
    }
  }
  return { path: resolve(context.workingDirectory, path), sha256: sha256(text as string), declaration: document }
}

/** The accepted mapping ships dormant. Candidate model names are deliberately not executable pins. */
const sameBinding = (left: ModelBinding, right: ModelBinding): boolean =>
  left.profile === right.profile &&
  left.runtime === right.runtime &&
  left.model === right.model &&
  left.revision === right.revision &&
  left.evidenceRevision === right.evidenceRevision

export const resolveSelection = async (
  context: AgentContext,
  request: SelectionRequest
): Promise<EffectiveSelection> => {
  const unusedRefusals: string[] = []
  if (request.acceptance !== undefined && request.role !== 'accept')
    unusedRefusals.push('acceptance-unverified: --acceptance requires --role accept')
  if (request.authority !== undefined && request.role === undefined)
    unusedRefusals.push('authority-unverified: --authority requires a role')
  const frozen = request.selection
  if (frozen) {
    const refusals: string[] = [...unusedRefusals]
    if (frozen.schema !== 'ki/agent-launch/v1' || frozen.role !== request.role)
      refusals.push('selection-invalid: frozen request identity changed')
    if (frozen.role !== undefined) {
      const evidence = context.launchEvidence
      const binding = frozen.binding
      const accepted = frozen.alternative
        ? evidence?.alternatives.filter(
            (item) => item.role === frozen.role && item.authoritySha256 === frozen.authority?.sha256
          )
        : [...Object.values(evidence?.profiles ?? {}), ...(evidence?.bindings ?? [])]
      if (
        !binding ||
        !accepted?.some((item) => item !== undefined && sameBinding(item, binding)) ||
        frozen.model !== binding.model ||
        frozen.runtime !== binding.runtime ||
        binding.profile !== frozen.profile ||
        !frozen.effort ||
        !binding.efforts.includes(frozen.effort)
      )
        refusals.push('profile-dormant: frozen selection has no current accepted evidence')
      if (
        !Object.hasOwn(profiles, frozen.role) ||
        (!frozen.alternative && frozen.runtime !== profiles[frozen.role].runtime)
      )
        refusals.push('model-runtime-mismatch: frozen role requires its accepted runtime binding')
      if ((frozen.role === 'prune' || frozen.role === 'release') && frozen.rules !== frozen.role)
        refusals.push('footer-mismatch: frozen role requires its matching footer')
      if ((frozen.rules === 'prune' || frozen.rules === 'release') && frozen.role !== frozen.rules)
        refusals.push('footer-mismatch: destructive footer requires its matching role')
      if (frozen.role === 'accept' && frozen.rules !== 'none') refusals.push('footer-mismatch: accept requires none')
      if (!frozen.authority) refusals.push('authority-unverified: frozen role has no authority')
      else {
        try {
          const authority = await authorityReference(context, `${frozen.authority.path}#${frozen.authority.heading}`)
          if (authority.sha256 !== frozen.authority.sha256) refusals.push('authority-changed: create a fresh request')
        } catch (error) {
          refusals.push(String(error))
        }
      }
      if (frozen.role === 'accept') {
        const old = frozen.acceptance as { path: string; sha256: string; declaration: unknown }
        try {
          const current = (await acceptanceEvidence(context, old.path, frozen.authority)) as { sha256: string }
          if (canonical(current) !== canonical(old)) refusals.push('acceptance-changed: create a fresh declaration')
        } catch (error) {
          refusals.push(String(error))
        }
        if (
          !evidence?.acceptance ||
          evidence.acceptance.revision !== frozen.acceptanceWordingRevision ||
          evidence.acceptance.render(old.declaration) !== frozen.acceptanceSupplement
        )
          refusals.push('acceptance-contract-unavailable: combined Harness verification is unavailable')
      }
    }
    return { ...frozen, refusals }
  }
  const role = request.role
  const profile = role !== undefined && Object.hasOwn(profiles, role) ? profiles[role] : undefined
  const refusals: string[] = [...unusedRefusals]
  if (role !== undefined && !profile) throw new KiError(`unknown role: ${role}`, 2)
  const runtime = request.explicitRuntime || !profile ? request.runtime : profile.runtime
  const effort = request.effort ?? profile?.effort
  const rules = request.explicitRules || !profile ? request.rules : profile.rules
  let authority: AuthorityReference | undefined
  let acceptance: unknown
  let acceptanceSupplement: string | undefined
  let acceptanceWordingRevision: string | undefined
  let binding: ModelBinding | undefined
  let alternative = false
  let model = request.model
  if (role !== undefined && profile) {
    if (!request.authority) refusals.push('authority-unverified: a role requires --authority <local-path#heading>')
    else {
      try {
        authority = await authorityReference(context, request.authority)
      } catch (error) {
        refusals.push(String(error))
      }
    }
    if ((role === 'prune' || role === 'release') && rules !== role)
      refusals.push(`footer-mismatch: ${role} requires --rules ${role}`)
    if ((rules === 'prune' || rules === 'release') && role !== rules)
      refusals.push('footer-mismatch: destructive footer requires its matching role')
    if (role === 'accept' && rules !== 'none') refusals.push('footer-mismatch: accept requires --rules none')
    const pin = context.launchEvidence?.profiles[profile.profile]
    if (runtime === profile.runtime && pin?.runtime === runtime && (model === undefined || model === pin.model))
      binding = pin
    else if (request.model && authority) {
      const authoritySha256 = authority.sha256
      binding = context.launchEvidence?.alternatives.find(
        (item) =>
          item.role === role &&
          item.runtime === runtime &&
          item.model === model &&
          item.authoritySha256 === authoritySha256
      )
      alternative = binding !== undefined
    }
    if (request.explicitRuntime && runtime !== profile.runtime && !model)
      refusals.push('model-unresolved: a changed runtime requires an explicit model')
    if (
      !binding?.model.trim() ||
      !binding.revision.trim() ||
      !binding.evidenceRevision.trim() ||
      binding.profile !== profile.profile
    )
      refusals.push(
        request.model
          ? 'model-evidence-unavailable: an explicit model needs accepted local validity and suitability evidence'
          : 'profile-dormant: no accepted evidence-backed model pin'
      )
    else {
      model = binding.model
      if (!effort || !binding.efforts.includes(effort))
        refusals.push('model-effort-unavailable: the evidenced model does not support this effort')
    }
    if (role === 'accept') {
      if (!request.acceptance) refusals.push('acceptance-unverified: accept requires --acceptance <local-json-path>')
      else {
        try {
          acceptance = await acceptanceEvidence(context, request.acceptance, authority)
        } catch (error) {
          refusals.push(String(error))
        }
      }
      const capability = context.launchEvidence?.acceptance
      if (!capability)
        refusals.push(
          'acceptance-contract-unavailable: Harness wording and the declaration validator require combined verification'
        )
      else if (acceptance) {
        acceptanceWordingRevision = capability.revision
        acceptanceSupplement = capability.render((acceptance as { declaration: unknown }).declaration)
      }
    }
  }
  if (model !== undefined && !model.trim()) refusals.push('model-unresolved: a model needs a name')
  return {
    schema: 'ki/agent-launch/v1',
    path: role === undefined ? 'legacy' : 'role',
    role,
    runtime,
    model,
    effort,
    rules,
    grants: request.allow ?? [],
    profileRevision: binding?.revision ?? profileRevision,
    profile: profile?.profile,
    authority,
    acceptance,
    acceptanceWordingRevision,
    acceptanceSupplement,
    binding,
    alternative,
    sources: {
      runtime: request.explicitRuntime ? 'explicit' : profile ? 'profile' : 'legacy',
      model: request.model !== undefined ? 'explicit' : binding ? 'profile' : profile ? 'unresolved' : 'legacy',
      effort: request.effort === undefined ? (profile ? 'profile' : 'legacy') : 'explicit',
      rules: request.explicitRules ? 'explicit' : profile ? 'profile' : 'legacy',
      grants: (request.allow?.length ?? 0) > 0 ? 'explicit' : 'legacy'
    },
    refusals
  }
}

export const requireSelection = (selection: EffectiveSelection): void => {
  if (selection.refusals.length) throw new KiError(selection.refusals.join('; '), 1)
}
