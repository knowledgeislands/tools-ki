import { lstat, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { describe, expect, test } from 'vitest'
import { type SandboxArea, sandbox } from '../_cli_helper.ts'

// Builds a full direct `scripts/rubric/items/index.ts` catalogue. Most tests use a
// compact literal which this fixture expands into the real family/item contract;
// dedicated catalogue tests below exercise the unabridged shape.
const rubric = (families: string, skill = 'ki-example'): string => `
const item = (value) => {
  if (!value || typeof value !== 'object') return value
  if (value.kind === 'mechanical') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Mechanical test criterion.',
    sources: value.sources ?? ['standard.md'],
    mechanical: {
      level: value.level,
      remediation: value.remediation ?? (value.conform === undefined ? { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' } : { class: 'automatic' }),
      audit: { phase: value.phase, run: value.audit },
      ...(value.conform === undefined ? {} : {
        conform: {
          phase: 'PRIMARY',
          run: async (context) => { context.propose(await value.conform(context)) }
        }
      })
    }
  }
  if (value.kind === 'judgment') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Judgment test criterion.',
    sources: value.sources ?? ['standard.md'],
    judgment: { scope: value.scope ?? 'Review the supplied evidence.', prompt: value.prompt, outcomes: value.outcomes ?? ['accepted'], guidance: value.guidance ?? 'Record the selected outcome.' }
  }
  return {
    ...value,
    description: value.description ?? 'Invalid test criterion.',
    sources: value.sources ?? ['standard.md']
  }
}
const family = (value) => !value || typeof value !== 'object' ? value : ({
  ...value,
  description: value.description ?? 'Test family.',
  standard: value.standard ?? 'standard.md',
  selectContext: value.selectContext ?? ((context) => context),
  items: Array.isArray(value.items) ? value.items.map(item) : value.items
})
const families = Array.isArray(${families}) ? (${families}).map(family) : ${families}
export default {
  contract: 1,
  name: '${skill}',
  concern: 'test governance',
  createSession: async ({ repository }) => {
    const proposals = []
    const context = { repository, propose: (proposal) => proposals.push(proposal) }
    return {
      subjects: [{ families: Array.isArray(families) ? families.map(({ code }) => code) : [], context: () => context }],
      proposal: () => proposals.length === 1 ? proposals[0] : ({
        writes: proposals.flatMap(({ writes = [] }) => writes),
        commands: proposals.flatMap(({ commands = [] }) => commands)
      })
    }
  },
  families
}
`

const setupPrefixCollisionHarness = async (data: SandboxArea): Promise<void> => {
  for (const { name, code, marker } of [
    { name: 'ki-repo-website', code: 'WEB-1', marker: 'website.txt' },
    { name: 'ki-repo-website-cloudflare', code: 'WCF-1', marker: 'cloudflare.txt' }
  ]) {
    const base = `ki/harnesses/example/harness/skills/${name}`
    await data.write(`${base}/SKILL.md`, `---\nname: ${name}\nki-depends-on: []\n---\n`)
    await data.write(
      `${base}/scripts/rubric/items/index.ts`,
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: '${name}', level: 'WARN', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/${marker}')
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          conform: async () => ({ writes: [{ path: '${marker}', content: '${name}\\n', create: true }] })
        }] }]`,
        name
      )
    )
  }
}

const setupSkill = async (
  data: SandboxArea,
  name: string,
  dependencies: readonly string[],
  definition: string
): Promise<void> => {
  const base = `ki/harnesses/example/harness/skills/${name}`
  await data.write(`${base}/SKILL.md`, `---\nname: ${name}\nki-depends-on: [${dependencies.join(', ')}]\n---\n`)
  await data.write(`${base}/scripts/rubric/items/index.ts`, definition)
}

describe('[ki repo conform writes]', () => {
  test('documents the shared output controls', async () => {
    const box = await sandbox()

    const result = await box.run('ki repo conform --help')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('--progress <mode>')
    expect(result.output).toContain('--progress-style <style>')
    expect(result.output).toContain('--reporter-levels <levels>')
    expect(result.output).toContain('--concise')
    expect(result.output).toContain('FAIL,WARN,FIXED')
  })

  test('renders only the final conform summary in concise mode', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({ rubric: rubric('[]') })

    const result = await box.run('ki repo conform --concise --progress always')

    expect(result).toEqual({
      exitCode: 0,
      output: 'summary: KI REPO CONFORM on project PASS · 1 skill\n'
    })
  })

  test('renders a repository summary before conform progress at regular and narrow widths', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({ rubric: rubric('[]') })

    const regular = await box.run('ki repo conform --progress always')
    const narrow = await box.run('ki repo conform --progress always', { interactive: true, columns: 1 })
    const invalidWidth = await box.run('ki repo conform --progress always', { columns: Number.NaN })
    const interactiveMulti = await box.run('ki repo conform --progress-style multi', {
      interactive: true,
      now: () => 0
    })
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n[skills.ki-extra]\n'
    )
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/SKILL.md',
      '---\nname: ki-extra\nki-depends-on: []\n---\n'
    )
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts',
      rubric('[]', 'ki-extra')
    )
    const multiple = await box.run('ki repo conform --progress always')

    expect(regular.output).toContain('╭─ KI REPO CONFORM')
    expect(regular.output).toContain('├─ loading')
    expect(narrow.output).toContain('\r\x1b[2K.')
    expect(invalidWidth.output).toContain('complete · 0/0 100% 0.0s')
    // Loading is retained, and a clean conform explains why it has no second pass.
    expect(regular.output).toContain('loading definitions complete')
    expect(regular.output).toContain('├─ conform')
    expect(regular.output).toContain('nothing staged; no re-audit required')
    expect(regular.output.match(/timings/g)).toHaveLength(1)
    // Stable skill and phase rows are redrawn as one panel while active.
    expect(interactiveMulti.output).toContain('\x1b[2A')
    expect(stripVTControlCharacters(interactiveMulti.output)).toContain('✓ ki-example')
    expect(stripVTControlCharacters(interactiveMulti.output)).toContain('gathering evidence complete')
    expect(multiple.output).toContain('│     ├─ example/harness:ki-example\n│     ╰─ example/harness:ki-extra')
  })

  test('selects an exact capability when another conforming skill extends its name', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-website]\n[skills.ki-repo-website-cloudflare]\n'
    )
    await setupPrefixCollisionHarness(box.data)

    const result = await box.run(`ki repo --repo ${box.project.path} conform --skill ki-repo-website`)

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('applied write website.txt')
    expect(result.output).not.toContain('cloudflare.txt')
    await expect(box.project.read('website.txt')).resolves.toBe('ki-repo-website\n')
    await expect(box.project.read('cloudflare.txt')).rejects.toThrow()
  })

  const governedItem = (level = 'FAIL') => `[{
      code: 'F', title: 'Family',
      items: [{
        kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: '${level}', phase: 'PRIMARY',
        audit: async ({ repository }) => {
          const { readFile } = await import('node:fs/promises')
          const content = await readFile(repository + '/governed.txt', 'utf8')
          return content === 'after\\n' ? [] : [{ status: 'VIOLATION', message: 'not conformed' }]
        },
        conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
      }]
    }]`

  test('suppresses conform write chatter in concise mode', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({ rubric: rubric(governedItem()) })

    const result = await box.run('ki repo conform --concise')

    expect(result).toEqual({
      exitCode: 0,
      output: 'summary: KI REPO CONFORM on project PASS · 1 skill\n'
    })
    await expect(box.project.read('governed.txt')).resolves.toBe('after\n')
  })

  test('reports nothing for an unconformable item whose outcome is not a violation', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'PASS', message: 'already conformed' }] }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('╭─ KI REPO CONFORM')
    expect(result.output).toContain('│  ╰─ ✓ example/harness:ki-example PASS')
    expect(result.output).toContain('╰─ summary: KI REPO CONFORM on project PASS · 1 skill')
  })

  test('does not re-audit a clean conform that staged no operation', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
        kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
        audit: (() => {
          let runs = 0
          return async () => {
            runs += 1
            if (runs > 1) throw new Error('clean conform re-audited')
            return [{ status: 'PASS', message: 'already conformed' }]
          }
        })()
      }] }]`)
    })

    const result = await box.run('ki repo conform --progress always')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('nothing staged; no re-audit required')
    expect(result.output.match(/timings/g)).toHaveLength(1)
  })

  test('publishes a complete conform write set, supports dry-run, and re-audits', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({ rubric: rubric(governedItem()) })

    const dryRun = await box.run('ki repo conform --dry-run')
    const beforeContent = await box.project.read('governed.txt')
    expect(dryRun.output).toContain('proposed write governed.txt\n')
    expect(dryRun.output).toContain('╰─ summary: KI REPO CONFORM on project PASS · 1 skill')
    expect(beforeContent).toBe('before\n')

    const conformed = await box.run('ki repo conform --progress always')
    const afterContent = await box.project.read('governed.txt')
    expect(conformed.output).toContain('applied write governed.txt\n')
    expect(conformed.output).toContain('├─ re-audit')
    expect(conformed.output).not.toContain('├─ verify')
    expect(conformed.output).toContain('╰─ summary: KI REPO CONFORM on project PASS · 1 skill')
    expect(afterContent).toBe('after\n')
  })

  test('nests multi-line conform findings beneath their skill result', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [
        { kind: 'mechanical', code: 'EXAMPLE-1', title: 'First', level: 'WARN', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'first line\\ncontinued first line' }] },
        { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Second', level: 'WARN', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'second line\\ncontinued second line' }] }
      ] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('│  ╰─ ! example/harness:ki-example WARN · FAIL=0 WARN=2 FIXED=0')
    expect(result.output).toContain('│     ├─ ! warn [First (EXAMPLE-1)] — first line\n│     │   continued first line')
    expect(result.output).toContain(
      '│     ╰─ ! warn [Second (EXAMPLE-2)] — second line\n│         continued second line'
    )
  })

  test('withholds a proposal that shares a skill with its blocking audit', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('safe.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [
        { kind: 'mechanical', code: 'EXAMPLE-1', title: 'Safe proposal', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'safe write is needed' }],
          conform: async () => ({ writes: [{ path: 'safe.txt', content: 'after\\n' }] }) },
        { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Blocking audit', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'unrelated license failure' }] }
      ] }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')

    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain('proposed write safe.txt')
    expect(dryRun.output).toContain(
      'withheld example/harness:ki-example: blocking example/harness:ki-example [Blocking audit (EXAMPLE-2)] — unrelated license failure'
    )
    expect(dryRun.output).not.toContain('would apply write safe.txt')
    expect(await box.project.read('safe.txt')).toBe('before\n')

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('proposed write safe.txt')
    expect(result.output).toContain('× fail [Blocking audit (EXAMPLE-2)] — unrelated license failure')
    expect(result.output).toContain(
      'repository conform completed independent publication with unresolved groups; blocking failure: repository conform found failures'
    )
    expect(result.output).not.toContain('applied write safe.txt')
    expect(await box.project.read('safe.txt')).toBe('before\n')
  })

  test('publishes an independent repository repair while reporting a blocking failure', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-blocked]\n[skills.ki-safe]\n'
    )
    await box.project.write('safe.txt', 'before\n')
    await setupSkill(
      box.data,
      'ki-blocked',
      [],
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
        kind: 'mechanical', code: 'BLOCKED-1', title: 'Blocking audit', level: 'FAIL', phase: 'PRIMARY',
        audit: async () => [{ status: 'VIOLATION', message: 'external settings require approval' }]
      }] }]`,
        'ki-blocked'
      )
    )
    await setupSkill(
      box.data,
      'ki-safe',
      [],
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
        kind: 'mechanical', code: 'SAFE-1', title: 'Safe repair', level: 'FAIL', phase: 'PRIMARY',
        audit: async ({ repository }) => {
          const { readFile } = await import('node:fs/promises')
          return (await readFile(repository + '/safe.txt', 'utf8')) === 'after\\n'
            ? [{ status: 'PASS', message: 'conformed' }]
            : [{ status: 'VIOLATION', message: 'safe repair is needed' }]
        },
        conform: async () => ({ writes: [{ path: 'safe.txt', content: 'after\\n' }] })
      }] }]`,
        'ki-safe'
      )
    )

    const dryRun = await box.run('ki repo conform --dry-run')

    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain('would apply write safe.txt')
    expect(dryRun.output).toContain('× fail [Blocking audit (BLOCKED-1)] — external settings require approval')
    expect(await box.project.read('safe.txt')).toBe('before\n')

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('applied write safe.txt')
    expect(result.output).toContain('↺ fixed [Safe repair (SAFE-1)] — conformed')
    expect(result.output).toContain('× fail [Blocking audit (BLOCKED-1)] — external settings require approval')
    expect(await box.project.read('safe.txt')).toBe('after\n')
  })

  test('withholds dependent, overlapping, unsafe, and command-backed groups while publishing an unrelated repair', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-blocked]\n[skills.ki-foundation]\n[skills.ki-feature]\n[skills.ki-overlap-one]\n[skills.ki-overlap-two]\n[skills.ki-unsafe]\n[skills.ki-command]\n[skills.ki-user-command]\n[skills.ki-user-safe]\n[skills.ki-safe]\n'
    )
    await box.project.write('safe.txt', 'before\n')
    await box.project.write('shared.txt', 'before\n')
    await box.project.write('outside.txt', 'before\n')
    await box.home.write('.managed/setting.txt', 'before\n')
    await symlink(join(box.project.path, 'outside.txt'), join(box.project.path, 'unsafe.txt'))
    const blocked = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'BLOCKED-1', title: 'Blocking audit', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'needs approval' }] }] }]`,
      'ki-blocked'
    )
    const foundation = rubric(
      `[{ code: 'F', title: 'Family', items: [
        { kind: 'mechanical', code: 'FOUNDATION-1', title: 'Foundation audit', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'foundation is unresolved' }] },
        { kind: 'mechanical', code: 'FOUNDATION-2', title: 'Foundation repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'foundation repair is needed' }], conform: async () => ({ writes: [{ path: 'foundation.txt', content: 'after\\n', create: true }] }) }
      ] }]`,
      'ki-foundation'
    )
    const feature = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'FEATURE-1', title: 'Dependent repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'feature repair is needed' }], conform: async () => ({ writes: [{ path: 'foundation.txt', content: 'after\\n', create: true }] }) }] }]`,
      'ki-feature'
    )
    const overlap = (name: string, content: string) =>
      rubric(
        `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: '${name}-1', title: 'Overlapping repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'overlap repair is needed' }], conform: async () => ({ writes: [{ path: 'shared.txt', content: '${content}\\n' }] }) }] }]`,
        name
      )
    const unsafe = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'UNSAFE-1', title: 'Unsafe repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'unsafe repair is needed' }], conform: async () => ({ writes: [{ path: 'unsafe.txt', content: 'after\\n' }] }) }] }]`,
      'ki-unsafe'
    )
    const command = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'COMMAND-1', title: 'Command repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'command repair is needed' }], conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "require('node:fs').writeFileSync('command.txt', 'after')"] }] }) }] }]`,
      'ki-command'
    )
    const userCommand = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'USER-COMMAND-1', title: 'User command repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'user command repair is needed' }], conform: async () => ({ writes: [], commands: [{ program: 'false', arguments: [] }] }) }] }]`,
      'ki-user-command'
    ).replace(
      "concern: 'test governance',",
      "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
    )
    const userSafe = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'USER-SAFE-1', title: 'User repair', level: 'WARN', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'user repair is needed' }], conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: 'after\\n' }] }) }] }]`,
      'ki-user-safe'
    ).replace(
      "concern: 'test governance',",
      "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
    )
    const safe = rubric(
      `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'SAFE-1', title: 'Safe repair', level: 'FAIL', phase: 'PRIMARY', audit: async ({ repository }) => (await (await import('node:fs/promises')).readFile(repository + '/safe.txt', 'utf8')) === 'after\\n' ? [{ status: 'PASS', message: 'conformed' }] : [{ status: 'VIOLATION', message: 'safe repair is needed' }], conform: async () => ({ writes: [{ path: 'safe.txt', content: 'after\\n' }] }) }] }]`,
      'ki-safe'
    )
    await setupSkill(box.data, 'ki-blocked', [], blocked)
    await setupSkill(box.data, 'ki-foundation', [], foundation)
    await setupSkill(box.data, 'ki-feature', ['ki-foundation'], feature)
    await setupSkill(box.data, 'ki-overlap-one', [], overlap('ki-overlap-one', 'first'))
    await setupSkill(box.data, 'ki-overlap-two', [], overlap('ki-overlap-two', 'second'))
    await setupSkill(box.data, 'ki-unsafe', [], unsafe)
    await setupSkill(box.data, 'ki-command', [], command)
    await setupSkill(box.data, 'ki-user-command', [], userCommand)
    await setupSkill(box.data, 'ki-user-safe', [], userSafe)
    await setupSkill(box.data, 'ki-safe', [], safe)

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'withheld example/harness:ki-foundation, example/harness:ki-feature: blocking example/harness:ki-foundation [Foundation audit (FOUNDATION-1)]'
    )
    expect(result.output).toContain(
      'refused example/harness:ki-overlap-one, example/harness:ki-overlap-two: direct conform repeats write path shared.txt with different content'
    )
    expect(result.output).toContain(
      'refused example/harness:ki-unsafe: direct conform write target unsafe.txt must be an existing regular file'
    )
    expect(result.output).toContain(
      'withheld example/harness:ki-command: command-backed conform repairs require --allow-commands while failures are unresolved'
    )
    expect(result.output).toContain(
      'refused example/harness:ki-user-command: user-home rubric conform actions must be guarded direct writes; conform commands are not permitted'
    )
    expect(result.output).toContain('applied write safe.txt')
    expect(result.output).toContain('applied write .managed/setting.txt')
    await expect(box.project.read('foundation.txt')).rejects.toThrow()
    await expect(box.project.read('command.txt')).rejects.toThrow()
    expect(await box.project.read('safe.txt')).toBe('after\n')
    expect(await box.project.read('shared.txt')).toBe('before\n')
    expect(await box.project.read('outside.txt')).toBe('before\n')
    expect(await box.home.read('.managed/setting.txt')).toBe('after\n')
  })

  test('runs an eligible guarded command only with explicit authority and re-audits it', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-blocked]\n[skills.ki-command]\n'
    )
    await setupSkill(
      box.data,
      'ki-blocked',
      [],
      rubric(
        `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'BLOCKED-1', title: 'Blocking audit', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'needs approval' }] }] }]`,
        'ki-blocked'
      )
    )
    await setupSkill(
      box.data,
      'ki-command',
      [],
      rubric(
        `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'COMMAND-1', title: 'Command repair', level: 'FAIL', phase: 'PRIMARY', audit: async ({ repository }) => {
        const { existsSync } = await import('node:fs')
        return existsSync(repository + '/command.txt') ? [{ status: 'PASS', message: 'conformed' }] : [{ status: 'VIOLATION', message: 'command repair is needed' }]
      }, conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "require('node:fs').writeFileSync('command.txt', 'after')"] }] }) }] }]`,
        'ki-command'
      )
    )

    const withheld = await box.run('ki repo conform')
    expect(withheld.exitCode).toBe(1)
    expect(withheld.output).toContain('command-backed conform repairs require --allow-commands')
    await expect(box.project.read('command.txt')).rejects.toThrow()
    const dryRun = await box.run('ki repo conform --allow-commands --dry-run')
    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain(
      `would run guarded "node" "-e" "require('node:fs').writeFileSync('command.txt', 'after')"`
    )
    await expect(box.project.read('command.txt')).rejects.toThrow()
    const allowed = await box.run('ki repo conform --allow-commands')
    expect(allowed.exitCode).toBe(1)
    expect(allowed.output).toContain(
      `run guarded "node" "-e" "require('node:fs').writeFileSync('command.txt', 'after')"`
    )
    expect(allowed.output).toContain('↺ fixed [Command repair (COMMAND-1)] — conformed')
    await expect(box.project.read('command.txt')).resolves.toBe('after')
  })

  test('reports a failed guarded command while retaining unresolved findings', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-blocked]\n[skills.ki-command]\n'
    )
    await setupSkill(
      box.data,
      'ki-blocked',
      [],
      rubric(
        `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'BLOCKED-1', title: 'Blocking audit', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'needs approval' }] }] }]`,
        'ki-blocked'
      )
    )
    await setupSkill(
      box.data,
      'ki-command',
      [],
      rubric(
        `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'COMMAND-1', title: 'Command repair', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'command repair is needed' }], conform: async () => ({ writes: [], commands: [{ program: 'false', arguments: [] }] }) }] }]`,
        'ki-command'
      )
    )

    const result = await box.run('ki repo conform --allow-commands')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('run guarded "false"')
    expect(result.output).toContain('failed example/harness:ki-command: direct subprocess conform failed: "false"')
  })

  test('deduplicates identical same-target conform proposals', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'one' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'two' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] }) }
          ]
        }]`)
    })

    const result = await box.run('ki repo conform --dry-run')

    expect(result.output).toContain('proposed write governed.txt\n')
    expect(result.output).toContain('├─ results')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('applies ordered item conforms to one shared draft and publishes one final write', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'start\n')
    await box.setupExampleHarness({
      rubric: `
import { readFileSync } from 'node:fs'
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'ordered conform',
  createSession: ({ repository }) => {
    const original = readFileSync(repository + '/governed.txt', 'utf8')
    let draft = original
    const context = {
      read: () => draft,
      append: (line) => { draft += line }
    }
    return {
      subjects: [{ families: ['ORDER'], context: () => context }],
      proposal: () => ({ writes: draft === original ? [] : [{ path: 'governed.txt', content: draft }] })
    }
  },
  families: [{
    code: 'ORDER',
    title: 'Ordered changes',
    description: 'Several rules share one draft.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'ORDER-1',
      title: 'Primary line',
      description: 'Adds the primary line.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        remediation: { class: 'automatic' },
        audit: {
          phase: 'INSPECT',
          run: ({ read }) => read().includes('primary\\n')
            ? [{ status: 'PASS', message: 'primary line is present' }]
            : [{ status: 'VIOLATION', message: 'primary line is absent' }]
        },
        conform: { phase: 'PRIMARY', run: ({ append }) => { append('primary\\n') } }
      }
    }, {
      code: 'ORDER-2',
      title: 'Normalised line',
      description: 'Adds the final line.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        remediation: { class: 'automatic' },
        audit: {
          phase: 'INSPECT',
          run: ({ read }) => read().includes('normalised\\n')
            ? [{ status: 'PASS', message: 'normalised line is present' }]
            : [{ status: 'VIOLATION', message: 'normalised line is absent' }]
        },
        conform: { phase: 'NORMALISE', run: ({ append }) => { append('normalised\\n') } }
      }
    }]
  }]
}
`
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output.match(/^applied write governed\.txt$/gm)).toHaveLength(1)
    expect(await box.project.read('governed.txt')).toBe('start\nprimary\nnormalised\n')
  })

  test('rejects same-target conform proposals with different replacement content', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'one' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after-one\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'two' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after-two\\n' }] }) }
          ]
        }]`)
    })

    const result = await box.run('ki repo conform --dry-run')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform repeats write path governed.txt with different content')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  // CLI-004 acceptance evidence (d): dry run is observational — repeating it changes
  // nothing (content or mtime) and produces byte-identical output each time; only the
  // real conform differs in its applied-write line and its actual effect.
  test('a repeated dry run is byte-identical and touches nothing; only a real conform writes', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({ rubric: rubric(governedItem()) })
    const targetPath = join(box.project.path, 'governed.txt')
    const beforeStat = await lstat(targetPath)

    const firstDryRun = await box.run('ki repo conform --dry-run')
    const secondDryRun = await box.run('ki repo conform --dry-run')
    const afterDryRunsStat = await lstat(targetPath)

    expect(firstDryRun).toEqual(secondDryRun)
    expect(firstDryRun.output).toContain('proposed write governed.txt\n')
    expect(await box.project.read('governed.txt')).toBe('before\n')
    expect(afterDryRunsStat.mtimeMs).toBe(beforeStat.mtimeMs)
    expect(afterDryRunsStat.size).toBe(beforeStat.size)

    const conformed = await box.run('ki repo conform')

    expect(conformed.output).not.toBe(firstDryRun.output)
    expect(conformed.output).toContain('applied write governed.txt\n')
    expect(await box.project.read('governed.txt')).toBe('after\n')
  })

  // CLI-004 acceptance evidence (e): a write target replaced by a symlink before conform
  // runs (the CLI-reachable shape of "concurrent target replacement" — no live process
  // interleaving needed, since prepareWrites' regular-file check runs fresh every call)
  // is refused before any guarded write, leaving the symlink and its shadowed file
  // untouched.
  test('refuses to conform a conform write target that has become a symlink', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('elsewhere.txt', 'shadow\n')
    await symlink(join(box.project.path, 'elsewhere.txt'), join(box.project.path, 'governed.txt'))
    await box.setupExampleHarness({ rubric: rubric(governedItem()) })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt must be an existing regular file')
    expect((await lstat(join(box.project.path, 'governed.txt'))).isSymbolicLink()).toBe(true)
    expect(await box.project.read('elsewhere.txt')).toBe('shadow\n')
  })

  // CLI-004 acceptance evidence (e): a write target that resolves, through a symlinked
  // parent directory, outside the repository root is refused even though its own lstat
  // looks like an ordinary regular file — the escape only shows up once the path is
  // fully resolved.
  test('refuses to conform a conform write target that escapes the repository through a symlinked directory', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.root.write('outside/target.txt', 'before\n')
    await symlink(join(box.root.path, 'outside'), join(box.project.path, 'escape'))
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
            conform: async () => ({ writes: [{ path: 'escape/target.txt', content: 'after\\n' }] })
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target escape/target.txt escapes the repository')
    expect(await box.root.read('outside/target.txt')).toBe('before\n')
  })

  test('retains an earlier successful write when a later target is unsafe', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed-1.txt', 'before-1\n')
    await box.project.write('elsewhere.txt', 'shadow\n')
    await symlink(join(box.project.path, 'elsewhere.txt'), join(box.project.path, 'governed-2.txt'))
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'x' }],
              conform: async () => ({ writes: [{ path: 'governed-1.txt', content: 'after-1\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'y' }],
              conform: async () => ({ writes: [{ path: 'governed-2.txt', content: 'after-2\\n' }] }) }
          ]
        }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')

    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain('direct conform write target governed-2.txt must be an existing regular file')
    expect(await box.project.read('governed-1.txt')).toBe('before-1\n')

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed-2.txt must be an existing regular file')
    expect(await box.project.read('governed-1.txt')).toBe('after-1\n')
  })

  test('reports FIXED when a re-audited item that was violated is now clean', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async ({ repository }) => {
              const { readFile } = await import('node:fs/promises')
              const content = await readFile(repository + '/governed.txt', 'utf8')
              return content === 'after\\n' ? [{ status: 'PASS', message: 'conformed' }] : [{ status: 'VIOLATION', message: 'not conformed' }]
            },
            conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('proposed write governed.txt\napplied write governed.txt')
    expect(result.output).toContain('│  ╰─ ↺ example/harness:ki-example FIXED · FAIL=0 WARN=0 FIXED=1')
    expect(result.output).toContain('│     ╰─ ↺ fixed [Example (EXAMPLE-1)] — conformed')
    expect(result.output).toContain(
      '╰─ summary: KI REPO CONFORM on project PASS=0 WARN=0 FAIL=0 FIXED=1 · FINDINGS: FAIL=0 WARN=0 FIXED=1'
    )
  })

  test('fails when re-audit after conform still finds the violation', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'always fails' }],
            conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('× fail [Example (EXAMPLE-1)] — always fails')
    expect(result.output).toContain('re-audit found failures')
  })

  test('rejects a conform write whose target does not exist as a regular file', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
            conform: async () => ({ writes: [{ path: 'missing.txt', content: 'x' }] })
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target missing.txt must be an existing regular file')
  })

  test('creates an explicitly declared new regular file atomically', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')
    expect(dryRun.output).toContain('proposed write created.txt\n')
    await expect(box.project.read('created.txt')).rejects.toThrow()

    const result = await box.run('ki repo conform')
    expect(result.output).toContain('applied write created.txt\n')
    expect(result.output).toContain('↺ fixed [Example (EXAMPLE-1)] — created')
    await expect(box.project.read('created.txt')).resolves.toBe('created\n')
  })

  test('creates an explicit target beneath absent repository directories', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/missing/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'missing/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('write missing/created.txt')
    await expect(box.project.read('missing/created.txt')).resolves.toBe('created\n')
  })

  test('creates an explicit target beneath an existing repository directory', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.mkdir('existing')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/existing/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'existing/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    await expect(box.project.read('existing/created.txt')).resolves.toBe('created\n')
  })

  test('refuses nested create targets below a file or symbolic-link parent', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('blocked', 'not a directory\n')
    await box.root.mkdir('outside')
    await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
          conform: async () => ({ writes: [
            { path: 'blocked/created.txt', content: 'created\\n', create: true },
            { path: 'linked/created.txt', content: 'created\\n', create: true }
          ] })
        }] }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')

    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain('direct conform create target blocked/created.txt escapes the repository')

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform create target blocked/created.txt escapes the repository')
  })

  test('refuses a nested create target below a symbolic-link parent', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.root.mkdir('outside')
    await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
          conform: async () => ({ writes: [{ path: 'linked/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform create target linked/created.txt escapes the repository')
  })

  // The immediate parent of a create target is refused by its own lstat, but an *intermediate*
  // segment is not: lstat resolves the components before the one it reports on, so a symlinked
  // ancestor is invisible to the containment check and only shows up once the path is resolved.
  test('refuses a create target whose intermediate segment links outside the repository', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.root.mkdir('outside/sub')
    await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
          conform: async () => ({ writes: [{ path: 'linked/sub/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')

    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain('direct conform create target linked/sub/created.txt escapes the repository')
    await expect(box.root.read('outside/sub/created.txt')).rejects.toThrow()
  })

  // The same shape with the link pointing back inside the repository passes containment, so the
  // refusal comes from the segment-by-segment walk in the publish path rather than from validation.
  test('refuses a create target whose intermediate segment is a symbolic link within the repository', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.mkdir('real/sub')
    await symlink(`${box.project.path}/real`, `${box.project.path}/linked`)
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
          conform: async () => ({ writes: [{ path: 'linked/sub/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform create target linked/sub/created.txt escapes the repository')
    await expect(box.project.read('real/sub/created.txt')).rejects.toThrow()
  })

  test('conforms a declared user-home path incrementally', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.home.write('.managed/setting.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ userHome }) => {
            const { readFile } = await import('node:fs/promises')
            return (await readFile(userHome + '/.managed/setting.txt', 'utf8')) === 'after\\n'
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: 'after\\n' }] })
        }] }]
`,
        'ki-example'
      )
        .replace(
          "concern: 'test governance',",
          "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
        )
        .replace('createSession: async ({ repository })', 'createSession: async ({ repository, userHome })')
        .replace('const context = { repository,', 'const context = { repository, userHome,')
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('applied write .managed/setting.txt')
    expect(await box.home.read('.managed/setting.txt')).toBe('after\n')
  })

  test('refuses a user-home rubric when HOME is missing', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric('[]').replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    })
    await rm(box.home.path, { recursive: true })

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╰─ audit failed')
    expect(result.output).toContain('ki: error: user home must be an existing physical directory')
  })

  test('coalesces identical user-home writes proposed by separate skills', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n[skills.ki-extra]\n'
    )
    await box.home.write('.managed/setting.txt', 'before\n')
    const userHomeRubric = (skill: string, code: string): string =>
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: 'after\\n' }] })
        }] }]`,
        skill
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    await box.setupExampleHarness({ rubric: userHomeRubric('ki-example', 'EXAMPLE-1') })
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/SKILL.md',
      '---\nname: ki-extra\nki-depends-on: []\n---\n'
    )
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts',
      userHomeRubric('ki-extra', 'EXTRA-1')
    )

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output.match(/^applied write \.managed\/setting\.txt$/gm)).toHaveLength(1)
    expect(await box.home.read('.managed/setting.txt')).toBe('after\n')
  })
})
