import { symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// Builds a full direct `scripts/rubric/items/index.ts` catalogue. Most tests use a
// compact literal which this fixture expands into the real family/item contract;
// dedicated catalogue tests below exercise the unabridged shape.
const rubric = (families: string, skill = 'ki-example'): string =>
  `
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

const runtimeActivationRubric = (runtimeSkill: string): string => `
export default {
  contract: 1,
  name: 'ki-repo',
  concern: 'runtime activation',
  scope: { kind: 'repository' },
  families: [{
    code: 'RUNTIMES', title: 'Runtime activation', description: 'Runtime activation', standard: 'standard.md', selectContext: (root) => root,
    items: [{
      code: 'RUNTIMES-2', title: 'Runtime skill', description: 'A runtime skill must be active.', sources: ['standard.md'],
      mechanical: {
        level: 'FAIL', remediation: { class: 'automatic', guidance: 'Activate the runtime skill.' },
        audit: { phase: 'INSPECT', run: (context) => context.states.every((state) => state.status === 'active') ? [{ status: 'PASS', message: 'runtime skill active' }] : [{ status: 'VIOLATION', message: context.states.map((state) => state.message).join('; ') }] },
        conform: { phase: 'PRIMARY', run: (context) => context.request() }
      }
    }]
  }],
  createSession: async ({ repositorySkills }) => {
    const states = repositorySkills?.inspect(['${runtimeSkill}']) ?? []
    return {
      subjects: [{ families: ['RUNTIMES'], context: async () => ({ states, request: () => repositorySkills?.propose(['${runtimeSkill}']) }) }],
      proposal: async () => ({ writes: [], commands: [] })
    }
  }
}
`

describe('[ki repo conform execution]', () => {
  test('activates a proposed declared runtime skill and re-audits it', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const rubricWithRuntimeProposal = runtimeActivationRubric('ki-runtime')
    await box.setupExampleHarness({ rubric: rubricWithRuntimeProposal, name: 'ki-repo' })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: rubricWithRuntimeProposal.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })

    const dryRun = await box.run('ki repo conform --dry-run')
    expect(dryRun.exitCode).toBe(1)
    expect(dryRun.output).toContain('proposed activate repository skill ki-runtime')

    const conformed = await box.run('ki repo conform')
    expect(conformed.exitCode).toBe(0)
    expect(conformed.output).toContain('activate repository skill ki-runtime')
    expect(await box.project.isSymlink('.agents/skills/ki-runtime')).toBe(true)

    const repeated = await box.run('ki repo conform')
    expect(repeated.exitCode).toBe(0)
    expect(repeated.output).toContain('nothing staged')
  })

  test('activates multiple proposed runtime skills in name order', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-zeta]\n\n[skills.ki-alpha]\n'
    )
    const runtimeRubric = runtimeActivationRubric('ki-runtime')
      .replace("repositorySkills?.inspect(['ki-runtime'])", "repositorySkills?.inspect(['ki-zeta', 'ki-alpha'])")
      .replace("repositorySkills?.propose(['ki-runtime'])", "repositorySkills?.propose(['ki-zeta', 'ki-alpha'])")
    await box.setupExampleHarness({ rubric: runtimeRubric, name: 'ki-repo' })
    for (const name of ['ki-zeta', 'ki-alpha']) {
      await box.setupExampleHarness({
        name,
        rubric: runtimeRubric.replace("name: 'ki-repo'", `name: '${name}'`)
      })
    }

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output.indexOf('activate repository skill ki-alpha')).toBeLessThan(
      result.output.indexOf('activate repository skill ki-zeta')
    )
    await expect(box.project.isSymlink('.agents/skills/ki-alpha')).resolves.toBe(true)
    await expect(box.project.isSymlink('.agents/skills/ki-zeta')).resolves.toBe(true)
  })

  test('fails when a successfully activated runtime skill still fails re-audit', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const runtimeRubric = runtimeActivationRubric('ki-runtime').replace(
      "? [{ status: 'PASS', message: 'runtime skill active' }]",
      "? [{ status: 'VIOLATION', message: 'activated runtime remains unacceptable' }]"
    )
    await box.setupExampleHarness({ rubric: runtimeRubric, name: 'ki-repo' })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: runtimeRubric.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('activate repository skill ki-runtime')
    expect(result.output).toContain('activated runtime remains unacceptable')
    expect(result.output).toContain('repository conform re-audit found failures')
    expect(await box.project.isSymlink('.agents/skills/ki-runtime')).toBe(true)
  })

  test('refuses a proposed runtime activation with an unsafe managed-skill entry', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const rubricWithRuntimeProposal = runtimeActivationRubric('ki-runtime')
    await box.setupExampleHarness({ rubric: rubricWithRuntimeProposal, name: 'ki-repo' })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: rubricWithRuntimeProposal.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })
    await box.project.write('.agents/skills/ki-runtime', 'foreign skill\n')

    const audit = await box.run('ki repo audit')
    const conform = await box.run('ki repo conform')

    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain('ki-runtime has an unsafe or incompatible managed-skill link')
    expect(conform.exitCode).toBe(1)
    expect(conform.output).toContain('repository skill ki-runtime is not available for activation')
    expect(await box.project.read('.agents/skills/ki-runtime')).toBe('foreign skill\n')
  })
  test.each([
    {
      title: 'no configured compatible runtime',
      runtime: 'claude-code',
      requested: 'ki-runtime',
      declaration: '[skills.ki-runtime]\n',
      message: 'ki-runtime has no compatible configured runtime'
    },
    {
      title: 'an undeclared repository skill',
      runtime: 'chatgpt-codex',
      requested: 'ki-unlisted',
      declaration: '',
      message: 'ki-unlisted is not a declared repository skill'
    }
  ])(
    'reports $title as blocked before a rubric can activate it',
    async ({ runtime, requested, declaration, message }) => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.project.write(
        '.ki-config.toml',
        `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["${runtime}"]\n\n${declaration}`
      )
      const rubricWithRuntimeProposal = runtimeActivationRubric(requested)
      await box.setupExampleHarness({ rubric: rubricWithRuntimeProposal, name: 'ki-repo' })
      if (declaration)
        await box.setupExampleHarness({
          name: requested,
          rubric: rubricWithRuntimeProposal.replace("name: 'ki-repo'", `name: '${requested}'`)
        })

      const audit = await box.run('ki repo audit')
      const conform = await box.run('ki repo conform')

      expect(audit.exitCode).toBe(1)
      expect(audit.output).toContain(message)
      expect(conform.exitCode).toBe(1)
      expect(conform.output).toContain(`repository skill ${requested} is not available for activation`)
    }
  )
  test.each([
    { request: 'undefined', message: 'repository skill request must contain non-empty names' },
    { request: '[1]', message: 'repository skill request must contain non-empty names' },
    { request: "['']", message: 'repository skill request must contain non-empty names' },
    {
      request: "['ki-runtime', 'ki-runtime']",
      message: 'repository skill request must not contain duplicates'
    }
  ])('rejects malformed runtime-skill inspection names: $request', async ({ request, message }) => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const runtimeRubric = runtimeActivationRubric('ki-runtime')
    await box.setupExampleHarness({
      rubric: runtimeRubric.replace(
        "repositorySkills?.inspect(['ki-runtime'])",
        `repositorySkills?.inspect(${request})`
      ),
      name: 'ki-repo'
    })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: runtimeRubric.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(message)
  })

  test('reports a dangling repository-skill link as unsafe', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const runtimeRubric = runtimeActivationRubric('ki-runtime')
    await box.setupExampleHarness({ rubric: runtimeRubric, name: 'ki-repo' })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: runtimeRubric.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })
    await box.project.mkdir('.agents/skills')
    await symlink(`${box.root.path}/missing-runtime-skill`, `${box.project.path}/.agents/skills/ki-runtime`, 'dir')

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('ki-runtime has an unsafe or incompatible managed-skill link')
  })

  test('re-audits after runtime-skill activation starts but cannot publish its link', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const runtimeRubric = runtimeActivationRubric('ki-runtime')
    await box.setupExampleHarness({ rubric: runtimeRubric, name: 'ki-repo' })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: runtimeRubric.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })
    await box.project.write('.agents/skills', 'not a directory\n')

    let transcript = ''
    await expect(
      box.run('ki repo conform', {
        captureOutput: (_stream, chunk) => {
          transcript += chunk
        }
      })
    ).rejects.toThrow('file already exists')
    expect(transcript).toContain('activate repository skill ki-runtime')
    expect(transcript).toContain('ki-runtime is not active for every compatible runtime')
  })

  test('reports the initial findings when runtime-skill activation is blocked before publication starts', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-runtime]\n'
    )
    const runtimeRubric = runtimeActivationRubric('ki-runtime')
    const blockedBeforeApply = runtimeRubric
      .replace('createSession: async ({ repositorySkills })', 'createSession: async ({ repository, repositorySkills })')
      .replace(
        "request: () => repositorySkills?.propose(['ki-runtime'])",
        `request: async () => {
        repositorySkills?.propose(['ki-runtime'])
        const fs = await import('node:fs/promises')
        await fs.mkdir(repository + '/.agents/skills', { recursive: true })
        await fs.writeFile(repository + '/.agents/skills/ki-runtime', 'foreign skill\\n')
      }`
      )
    await box.setupExampleHarness({ rubric: blockedBeforeApply, name: 'ki-repo' })
    await box.setupExampleHarness({
      name: 'ki-runtime',
      rubric: runtimeRubric.replace("name: 'ki-repo'", "name: 'ki-runtime'")
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('activate repository skill ki-runtime')
    expect(result.output).toContain('ki-runtime is not active for every compatible runtime')
    expect(result.output).toContain('ki-runtime has an unsafe or incompatible managed-skill link')
    expect(await box.project.read('.agents/skills/ki-runtime')).toBe('foreign skill\n')
  })

  test('refuses conflicting user-home writes proposed by separate skills', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n[skills.ki-extra]\n'
    )
    await box.home.write('.managed/setting.txt', 'before\n')
    const userHomeRubric = (skill: string, code: string, content: string): string =>
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: '${content}' }] })
        }] }]`,
        skill
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    await box.setupExampleHarness({ rubric: userHomeRubric('ki-example', 'EXAMPLE-1', 'first\\n') })
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/SKILL.md',
      '---\nname: ki-extra\nki-depends-on: []\n---\n'
    )
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts',
      userHomeRubric('ki-extra', 'EXTRA-1', 'second\\n')
    )

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform repeats write path .managed/setting.txt with different content')
    expect(await box.home.read('.managed/setting.txt')).toBe('before\n')
  })

  test('refuses a user-home write outside the declaring skill filesystem scope', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.home.write('.outside/setting.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.outside/setting.txt', content: 'after\\n' }] })
        }] }]`,
        'ki-example'
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'direct conform write path .outside/setting.txt is outside its declared filesystem scope'
    )
    expect(await box.home.read('.outside/setting.txt')).toBe('before\n')
  })

  test('refuses user-home conform commands before running them', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.home.write('.managed/setting.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'false', arguments: [] }] })
        }] }]`,
        'ki-example'
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'user-home rubric conform actions must be guarded direct writes; conform commands are not permitted'
    )
    expect(await box.home.read('.managed/setting.txt')).toBe('before\n')
  })

  test('refuses an explicit create target that already exists', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('created.txt', 'existing\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: 'created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform create target created.txt must not already exist')
    await expect(box.project.read('created.txt')).resolves.toBe('existing\n')
  })

  test('an unfixed violation (no conform function) blocks conform and is reported', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'not fixable' }]
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('× fail [Example (EXAMPLE-1)] — not fixable')
    expect(result.output).toContain('repository conform found failures')
  })

  test('a conform proposing no writes leaves its violation reported and unfixed', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'nothing safe to propose' }],
            conform: async () => ({ writes: [] })
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('! warn [Example (EXAMPLE-1)] — nothing safe to propose')
  })

  test('reports subprocess conforms in dry-run mode without executing them, then runs and re-audits them', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'NORMALISE',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/conformed.txt')
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "require('node:fs').writeFileSync('conformed.txt', 'ok')"] }] })
        }] }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')
    const conformed = await box.run('ki repo conform')

    expect(dryRun.output).toContain(`would run "node" "-e" "require('node:fs').writeFileSync('conformed.txt', 'ok')"\n`)
    expect(conformed.output).toContain(`run "node" "-e" "require('node:fs').writeFileSync('conformed.txt', 'ok')"\n`)
    expect(conformed.output).toContain('↺ fixed [Example (EXAMPLE-1)] — conformed')
    await expect(box.project.read('conformed.txt')).resolves.toBe('ok')
  })

  test('reports a failed subprocess conform with its command output', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.stdout.write('detail'); process.exit(3)"] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'direct subprocess conform failed: "node" "-e" "process.stdout.write(\'detail\'); process.exit(3)"\ndetail'
    )
  })

  test('combines stdout and stderr from a failed subprocess conform', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      "\"process.stdout.write('out'); process.stderr.write('err'); process.exit(3)\"\nout\nerr"
    )
  })

  test('conforms INFO outcomes explicitly opted into conforming and retains a fixed subject', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: `
import { readFile } from 'node:fs/promises'

export default {
  contract: 1,
  name: 'ki-example',
  concern: 'INFO conforming',
  createSession: async ({ repository }) => ({
    subjects: [{ families: ['F'], subject: 'workspace', context: () => ({ repository }) }],
    proposal: () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
  }),
  families: [{
    code: 'F', title: 'Family', description: 'Test family.', standard: 'standard.md', selectContext: (context) => context,
    items: [
      {
        code: 'INFO-1', title: 'Info conform', description: 'Conforms an opted-in INFO result.', sources: ['standard.md'],
        mechanical: {
          level: 'WARN', conformOn: ['INFO'],
          remediation: { class: 'automatic' },
          audit: { phase: 'PRIMARY', run: async ({ repository }) =>
            (await readFile(repository + '/governed.txt', 'utf8')) === 'after\\n'
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'INFO', message: 'needs normalisation' }]
          },
          conform: { phase: 'PRIMARY', run: async () => {} }
        }
      },
      {
        code: 'SKIP-1', title: 'Skipped conform', description: 'Does not conform a non-violation.', sources: ['standard.md'],
        mechanical: {
          level: 'WARN',
          remediation: { class: 'diagnostic', guidance: 'No action is required.' },
          audit: { phase: 'PRIMARY', run: async () => [{ status: 'NOT_APPLICABLE', message: 'not applicable' }] },
        }
      }
    ]
  }]
}
`
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('↺ fixed [Info conform (INFO-1)] workspace — conformed')
    expect(await box.project.read('governed.txt')).toBe('after\n')
  })

  test('orders same-phase conform actions by their family declaration', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[
          { code: 'SECOND', title: 'Second', items: [{
            kind: 'mechanical', code: 'SECOND-1', title: 'Second item', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'second' }],
            conform: async () => ({ writes: [] })
          }] },
          { code: 'FIRST', title: 'First', items: [{
            kind: 'mechanical', code: 'FIRST-1', title: 'First item', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'first' }],
            conform: async () => ({ writes: [] })
          }] }
        ]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output.indexOf('[Second item (SECOND-1)]')).toBeLessThan(
      result.output.indexOf('[First item (FIRST-1)]')
    )
  })

  test('refuses an unsafe direct conform write before publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '../outside.txt', content: 'after\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write path ../outside.txt is unsafe')
    await expect(box.root.read('outside.txt')).rejects.toThrow()
  })

  test('reports a failed silent subprocess conform without an empty detail line', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', 'process.exit(3)'] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╭─ KI REPO CONFORM')
    expect(result.output).toContain('proposed run "node" "-e" "process.exit(3)"\nrun "node" "-e" "process.exit(3)"')
    expect(result.output).toContain('ki: error: direct subprocess conform failed: "node" "-e" "process.exit(3)"')
  })

  test('reports a subprocess terminated by a signal as a failed conform', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.kill(process.pid, 'SIGTERM')"] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╭─ KI REPO CONFORM')
    expect(result.output).toContain(
      'proposed run "node" "-e" "process.kill(process.pid, \'SIGTERM\')"\nrun "node" "-e" "process.kill(process.pid, \'SIGTERM\')"'
    )
    expect(result.output).toContain(
      'ki: error: direct subprocess conform failed: "node" "-e" "process.kill(process.pid, \'SIGTERM\')"'
    )
  })

  test('rejects a malformed subprocess conform proposal before execution', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{}] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('rubric session proposal command 0 must have a program and arguments')
  })
})
