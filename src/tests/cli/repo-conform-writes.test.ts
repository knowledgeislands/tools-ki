import { lstat, realpath, rm, symlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type SandboxArea, sandbox } from './_cli_helper.ts'

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
    judgment: { prompt: value.prompt }
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

const projectRoot = (area: SandboxArea): Promise<string> => realpath(area.path)

const setupPrefixCollisionHarness = async (data: SandboxArea): Promise<void> => {
  for (const { name, code, marker } of [
    { name: 'ki-website', code: 'WEB-1', marker: 'website.txt' },
    { name: 'ki-website-cloudflare', code: 'WCF-1', marker: 'cloudflare.txt' }
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

describe('[ki repo conform writes]', () => {
  test('documents the shared output controls', async () => {
    const box = await sandbox()

    const result = await box.run('ki repo conform --help')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('--progress <mode>')
    expect(result.output).toContain('--progress-style <style>')
    expect(result.output).toContain('--reporter-levels <levels>')
    expect(result.output).toContain('FAIL,WARN,FIXED')
  })

  test('renders a repository summary before conform progress at regular and narrow widths', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    await box.setupExampleHarness({ rubric: rubric('[]') })

    const regular = await box.run('ki repo conform --progress always')
    const narrow = await box.run('ki repo conform --progress always', { interactive: true, columns: 1 })
    const invalidWidth = await box.run('ki repo conform --progress always', { columns: Number.NaN })
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n["example/harness:ki-extra"]\n')
    await box.data.write('ki/harnesses/example/harness/skills/ki-extra/SKILL.md', '---\nname: ki-extra\nki-depends-on: []\n---\n')
    await box.data.write('ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts', rubric('[]', 'ki-extra'))
    const multiple = await box.run('ki repo conform --progress always')

    expect(regular.output).toContain('╭─ KI REPOSITORY · CONFORM')
    expect(regular.output).toContain('CONFORM    [')
    expect(narrow.output).toContain('\r\x1b[2K.')
    expect(invalidWidth.output).toContain('CONFORM    [################################] 0/0 100% complete')
    expect(multiple.output).toContain('│     ├─ example/harness:ki-example\n│     ╰─ example/harness:ki-extra')
  })

  test('selects an exact capability when another conforming skill extends its name', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-website"]\n["example/harness:ki-website-cloudflare"]\n')
    await setupPrefixCollisionHarness(box.data)

    const result = await box.run(`ki repo --repo ${box.project.path} conform --skill ki-website`)

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('applied write website.txt')
    expect(result.output).not.toContain('cloudflare.txt')
    await expect(box.project.read('website.txt')).resolves.toBe('ki-website\n')
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

  test('reports nothing for an unconformable item whose outcome is not a violation', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'PASS', message: 'already conformed' }] }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result).toEqual({
      exitCode: 0,
      output: `
==> [${basename(await projectRoot(box.project))}][example/harness:ki-example] conform
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> recap
  ✅ no FAIL / WARN / FIXED findings across conformed skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
    })
  })

  test('publishes a complete conform write set, supports dry-run, and re-audits', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({ rubric: rubric(governedItem()) })

    const dryRun = await box.run('ki repo conform --dry-run')
    const beforeContent = await box.project.read('governed.txt')
    expect(dryRun.output).toContain('proposed write governed.txt\n')
    expect(dryRun.output).toContain('==> recap\n  ✅ no findings across conformed skills')
    expect(beforeContent).toBe('before\n')

    const conformed = await box.run('ki repo conform')
    const afterContent = await box.project.read('governed.txt')
    expect(conformed.output).toContain('applied write governed.txt\n')
    expect(conformed.output).toContain('✅ no findings across conformed skills')
    expect(afterContent).toBe('after\n')
  })

  test('holds every proposed write until every initial audit passes', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      'repository conform dry run aborted before publication: no proposed conform changes were applied; blocking failure: repository conform found failures'
    )
    expect(dryRun.output).not.toContain('would apply write safe.txt')
    expect(await box.project.read('safe.txt')).toBe('before\n')

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('proposed write safe.txt')
    expect(result.output).toContain('❌ fail  [Blocking audit (EXAMPLE-2)] — unrelated license failure')
    expect(result.output).toContain(
      'repository conform aborted before publication: no proposed conform changes were applied; blocking failure: repository conform found failures'
    )
    expect(result.output).not.toContain('applied write safe.txt')
    expect(await box.project.read('safe.txt')).toBe('before\n')
  })

  test('deduplicates identical same-target conform proposals', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    expect(result.output).toContain('==> recap')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('applies ordered item conforms to one shared draft and publishes one final write', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    expect(result).toEqual({
      exitCode: 0,
      output: `proposed write governed.txt
applied write governed.txt

==> [${basename(await projectRoot(box.project))}][example/harness:ki-example] conform
  ✅ fixed [Example (EXAMPLE-1)] — conformed
  ✅ summary: FAIL=0 WARN=0 FIXED=1 JUDGMENT_UNEVALUATED=0
  ✅ fixed complete

==> recap
  ✅ fixed example/harness:ki-example [Example (EXAMPLE-1)] — conformed
  ✅ totals: FAIL=0 WARN=0 FIXED=1 JUDGMENT_UNEVALUATED=0
`
    })
  })

  test('fails when re-audit after conform still finds the violation', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    expect(result.output).toContain('❌ fail  [Example (EXAMPLE-1)] — always fails')
    expect(result.output).toContain('re-audit found failures')
  })

  test('rejects a conform write whose target does not exist as a regular file', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    expect(result.output).toContain('✅ fixed [Example (EXAMPLE-1)] — created')
    await expect(box.project.read('created.txt')).resolves.toBe('created\n')
  })

  test('creates an explicit target beneath absent repository directories', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

  test('conforms a declared user-home path incrementally', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
        .replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
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
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    await box.setupExampleHarness({
      rubric: rubric('[]').replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
    })
    await rm(box.home.path, { recursive: true })

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╰─ audit failed')
    expect(result.output).toContain('ki: error: user home must be an existing physical directory')
  })

  test('coalesces identical user-home writes proposed by separate skills', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n["example/harness:ki-extra"]\n')
    await box.home.write('.managed/setting.txt', 'before\n')
    const userHomeRubric = (skill: string, code: string): string =>
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: 'after\\n' }] })
        }] }]`,
        skill
      ).replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
    await box.setupExampleHarness({ rubric: userHomeRubric('ki-example', 'EXAMPLE-1') })
    await box.data.write('ki/harnesses/example/harness/skills/ki-extra/SKILL.md', '---\nname: ki-extra\nki-depends-on: []\n---\n')
    await box.data.write('ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts', userHomeRubric('ki-extra', 'EXTRA-1'))

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output.match(/^applied write \.managed\/setting\.txt$/gm)).toHaveLength(1)
    expect(await box.home.read('.managed/setting.txt')).toBe('after\n')
  })
})
