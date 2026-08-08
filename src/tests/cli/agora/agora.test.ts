import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const profile = (projects = ''): string => `name = "Example"\ntool = "zed"${projects}\n`

describe('[ki agora]', () => {
  test('lists, shows, and opens a project-name ordered Zed profile in one window', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/agoras/example.ki-agora',
      profile('\n[projects]\nzulu = "/zulu"\nprimary = "/primary"\nalpha = "/alpha"')
    )
    await box.config.write('ki/agoras/zeta.ki-agora', profile())
    await box.config.write('ki/agoras/ignored.toml', profile())
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })
    expect(await box.run('ki agora list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORAS\n├─ profiles (2)\n│  ├─ example — Example (3 projects)\n│  ╰─ zeta — Example (0 projects)\n╰─ summary: PROFILES=2 PROJECTS=3\n'
    })
    expect(await box.run('ki agora show example')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORA\n├─ example\n│  ├─ name: Example\n│  ╰─ tool: zed\n├─ projects (3)\n│  ├─ /alpha\n│  ├─ /primary\n│  ╰─ /zulu\n╰─ summary: PROJECTS=3\n'
    })
    expect(await box.run('ki agora open example')).toEqual({
      exitCode: 0,
      output: 'ki agora open example: opened 3 Zed projects\n'
    })
    expect(calls).toEqual(['zed -n', 'zed -e /zulu', 'zed -e /primary', 'zed -e /alpha'])
  })

  test('reports an absent directory and supports empty profiles', async () => {
    const box = await sandbox()
    expect(await box.run('ki agora list')).toEqual({
      exitCode: 0,
      output: '╭─ KI AGORAS\n├─ profiles (0)\n│  ╰─ none\n╰─ summary: PROFILES=0 PROJECTS=0\n'
    })
    await box.config.write('ki/agoras/empty.ki-agora', profile())
    expect(await box.run('ki agora show empty')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORA\n├─ empty\n│  ├─ name: Example\n│  ╰─ tool: zed\n├─ projects (0)\n│  ╰─ none\n╰─ summary: PROJECTS=0\n'
    })
    expect(await box.run('ki agora open empty')).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora empty has no projects\n'
    })
    expect(await box.run('ki repo --agora empty roadmap list')).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora empty has no projects\n'
    })
  })

  test('resolves explicit relative and absolute profile paths', async () => {
    const box = await sandbox()
    await box.project.write('relative.ki-agora', profile())
    await box.home.write('absolute.ki-agora', profile())

    expect(await box.run('ki agora show relative.ki-agora')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORA\n├─ relative\n│  ├─ name: Example\n│  ╰─ tool: zed\n├─ projects (0)\n│  ╰─ none\n╰─ summary: PROJECTS=0\n'
    })
    expect(await box.run(['ki', 'agora', 'show', join(box.home.path, 'absolute.ki-agora')])).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORA\n├─ absolute\n│  ├─ name: Example\n│  ╰─ tool: zed\n├─ projects (0)\n│  ╰─ none\n╰─ summary: PROJECTS=0\n'
    })
  })

  test('rejects missing and unsafe profile paths', async () => {
    const box = await sandbox()
    const directory = await box.config.mkdir('ki/agoras/directory.ki-agora')
    await box.config.write('ki/agoras/target.ki-agora', profile())
    const linked = join(box.config.path, 'ki/agoras/linked.ki-agora')
    await symlink(join(box.config.path, 'ki/agoras/target.ki-agora'), linked)

    expect((await box.run('ki agora show missing')).output).toContain('no Agora profile')
    expect((await box.run('ki agora create Upper')).output).toContain(
      'Agora name must use lower-case letters, numbers, and hyphens'
    )
    expect((await box.run(['ki', 'agora', 'show', directory])).output).toContain('must be a regular file')
    expect((await box.run(['ki', 'agora', 'show', linked])).output).toContain('must be a regular file')
  })

  test('rejects malformed profile documents', async () => {
    const box = await sandbox()
    const cases = [
      ['invalid-toml', 'name =', 'must be valid TOML'],
      ['missing-name', 'tool = "zed"', 'name must be a non-empty string'],
      ['empty-name', 'name = ""\ntool = "zed"', 'name must be a non-empty string'],
      ['wrong-tool', 'name = "Example"\ntool = "other"', 'tool must equal "zed"'],
      ['array-projects', 'name = "Example"\ntool = "zed"\n\n[[projects]]\npath = "/one"', 'projects must be a table'],
      [
        'unsupported-primary',
        'name = "Example"\ntool = "zed"\nprimary = "one"\n\n[projects]\none = "/one"',
        'primary is no longer supported'
      ],
      [
        'numeric-project',
        'name = "Example"\ntool = "zed"\n\n[projects]\none = 1',
        'project one must be a non-empty path'
      ],
      [
        'empty-project',
        'name = "Example"\ntool = "zed"\n\n[projects]\none = ""',
        'project one must be a non-empty path'
      ],
      [
        'relative-project',
        'name = "Example"\ntool = "zed"\n\n[projects]\none = "relative"',
        'project one path must be absolute'
      ],
      [
        'duplicate-projects',
        'name = "Example"\ntool = "zed"\n\n[projects]\none = "/same"\ntwo = "/same"',
        'projects must not contain duplicate paths'
      ]
    ] as const

    for (const [id, content, message] of cases) {
      await box.config.write(`ki/agoras/${id}.ki-agora`, `${content}\n`)
      const result = await box.run(`ki agora show ${id}`)
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain(message)
    }
  })

  test('reports Zed launch failures with and without process output', async () => {
    const box = await sandbox()
    await box.config.write('ki/agoras/example.ki-agora', profile('\n[projects]\none = "/one"'))
    box.setRunner(async () => ({ exitCode: 7, output: 'launch failed\n' }))
    expect(await box.run('ki agora open example')).toEqual({
      exitCode: 7,
      output: 'ki: error: could not open Agora example: launch failed\n'
    })

    box.setRunner(async () => ({ exitCode: 8, output: '' }))
    expect(await box.run('ki agora open example')).toEqual({
      exitCode: 8,
      output: 'ki: error: could not open Agora example: zed failed\n'
    })

    box.setRunner(async (_command, arguments_) =>
      arguments_[0] === '-n' ? { exitCode: 0, output: '' } : { exitCode: 9, output: 'project failed\n' }
    )
    expect(await box.run('ki agora open example')).toEqual({
      exitCode: 9,
      output: 'ki: error: could not open Agora example: project failed\n'
    })

    box.setRunner(async (_command, arguments_) =>
      arguments_[0] === '-n' ? { exitCode: 0, output: '' } : { exitCode: 10, output: '' }
    )
    expect(await box.run('ki agora open example')).toEqual({
      exitCode: 10,
      output: 'ki: error: could not open Agora example: zed failed\n'
    })
  })

  test('creates, mutates, discovers, and selects named global repository profiles', async () => {
    const box = await sandbox()
    await box.project.write('first/.ki-config.toml', '# first\n')
    await box.project.write('second/.ki-config.toml', '# second\n')
    await box.project.write('nested/third/.ki-config.toml', '# third\n')
    await box.project.write('dotted.project/.ki-config.toml', '# dotted\n')
    const first = await box.project.mkdir('first')
    const second = await box.project.mkdir('second')
    const third = await box.project.mkdir('nested/third')
    const dotted = await box.project.mkdir('dotted.project')

    expect(await box.run('ki agora create inventory')).toEqual({
      exitCode: 0,
      output: 'ki agora create: created inventory\n'
    })
    expect((await box.run('ki agora create inventory')).output).toContain('Agora inventory already exists')
    expect(await box.run('ki agora add inventory first')).toEqual({
      exitCode: 0,
      output: 'ki agora add: inventory now has 1 projects\n'
    })
    expect((await box.run('ki agora add inventory first')).output).toContain(
      'Agora inventory already has a project named first'
    )
    await symlink(first, join(box.project.path, 'linked-first'))
    expect((await box.run('ki agora add inventory linked-first')).output).toContain(
      'Agora project linked-first must be an existing physical directory'
    )
    expect((await box.run('ki agora add inventory missing-project')).output).toContain(
      'Agora project missing-project must be an existing physical directory'
    )
    // The filesystem root is an existing physical directory with no basename, so it passes the
    // project check and then has no name to key a member by.
    expect((await box.run('ki agora add inventory /')).output).toContain('cannot derive an Agora project name from /')
    expect(await box.run('ki agora add inventory second')).toEqual({
      exitCode: 0,
      output: 'ki agora add: inventory now has 2 projects\n'
    })
    expect(await box.run('ki agora add inventory dotted.project')).toEqual({
      exitCode: 0,
      output: 'ki agora add: inventory now has 3 projects\n'
    })
    const roadmap = await box.run('ki repo --agora inventory roadmap list')
    expect(roadmap.exitCode).toBe(1)
    expect(roadmap.output).toContain(`│     ${dotted}\n├─ roadmap (0)`)
    expect(roadmap.output).toContain(`│     ${first}\n├─ roadmap (0)`)
    expect(roadmap.output).toContain(`│     ${second}\n├─ roadmap (0)`)
    expect(roadmap.output).toContain('├─ trades (0)')
    expect(await box.run('ki agora remove inventory first')).toEqual({
      exitCode: 0,
      output: 'ki agora remove: inventory now has 2 projects\n'
    })
    expect((await box.run('ki agora remove inventory first')).output).toContain(
      'Agora inventory has no project named first'
    )
    expect(await box.run('ki agora create discovered')).toEqual({
      exitCode: 0,
      output: 'ki agora create: created discovered\n'
    })
    await box.project.mkdir('nested/.git')
    await box.project.write('nested/ignored.txt', 'ignore\n')
    await symlink(third, join(box.project.path, 'nested/linked-third'))
    expect(await box.run('ki agora discover discovered nested')).toEqual({
      exitCode: 0,
      output: 'ki agora discover: discovered now has 1 projects\n'
    })
    expect(await box.run('ki agora show discovered')).toEqual({
      exitCode: 0,
      output: `╭─ KI AGORA\n├─ discovered\n│  ├─ name: discovered\n│  ╰─ tool: zed\n├─ projects (1)\n│  ╰─ ${third}\n╰─ summary: PROJECTS=1\n`
    })
    await box.config.write('ki/agoras/duplicate.ki-agora', profile(`\n[projects]\nalias = ${JSON.stringify(first)}`))
    expect((await box.run('ki agora add duplicate first')).output).toContain(
      `Agora duplicate already has project ${first}`
    )
    await box.config.write('ki/agoras/collision.ki-agora', profile(`\n[projects]\nthird = ${JSON.stringify(second)}`))
    expect((await box.run('ki agora discover collision nested')).output).toContain(
      'Agora collision already has a different project named third'
    )
    const empty = await box.project.mkdir('empty')
    expect((await box.run('ki agora discover discovered empty')).output).toContain(
      `Agora discovery found no KI repositories in ${empty}`
    )
  })
})
