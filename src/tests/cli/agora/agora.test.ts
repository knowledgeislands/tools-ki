import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const profile = (projects = ''): string => `name = "Example"\ntool = "zed"${projects}\n`

describe('[ki agora]', () => {
  test('lists, shows, and opens a project-name ordered Zed profile in one window', async () => {
    const box = await sandbox()
    await box.config.write('ki/agoras/example.ki-agora', profile('\n[projects]\nzulu = "/zulu"\nprimary = "/primary"\nalpha = "/alpha"'))
    await box.config.write('ki/agoras/zeta.ki-agora', profile())
    await box.config.write('ki/agoras/ignored.toml', profile())
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })
    expect(await box.run('ki agora list')).toEqual({
      exitCode: 0,
      output: 'ki agora list\n  example — Example (3 projects)\n  zeta — Example (0 projects)\n'
    })
    expect(await box.run('ki agora show example')).toEqual({
      exitCode: 0,
      output: 'ki agora show example\n  Example\n  tool zed\n  project /alpha\n  project /primary\n  project /zulu\n'
    })
    expect(await box.run('ki agora open example')).toEqual({ exitCode: 0, output: 'ki agora open example: opened 3 Zed projects\n' })
    expect(calls).toEqual(['zed -n', 'zed -e /zulu', 'zed -e /primary', 'zed -e /alpha'])
  })

  test('reports an absent directory and supports empty profiles', async () => {
    const box = await sandbox()
    expect(await box.run('ki agora list')).toEqual({ exitCode: 0, output: 'ki agora list\n' })
    await box.config.write('ki/agoras/empty.ki-agora', profile())
    expect(await box.run('ki agora show empty')).toEqual({ exitCode: 0, output: 'ki agora show empty\n  Example\n  tool zed\n' })
    expect(await box.run('ki agora open empty')).toEqual({ exitCode: 2, output: 'ki: error: Agora empty has no projects\n' })
  })

  test('resolves explicit relative and absolute profile paths', async () => {
    const box = await sandbox()
    await box.project.write('relative.ki-agora', profile())
    await box.home.write('absolute.ki-agora', profile())

    expect(await box.run('ki agora show relative.ki-agora')).toEqual({ exitCode: 0, output: 'ki agora show relative\n  Example\n  tool zed\n' })
    expect(await box.run(['ki', 'agora', 'show', join(box.home.path, 'absolute.ki-agora')])).toEqual({
      exitCode: 0,
      output: 'ki agora show absolute\n  Example\n  tool zed\n'
    })
  })

  test('rejects missing and unsafe profile paths', async () => {
    const box = await sandbox()
    const directory = await box.config.mkdir('ki/agoras/directory.ki-agora')
    await box.config.write('ki/agoras/target.ki-agora', profile())
    const linked = join(box.config.path, 'ki/agoras/linked.ki-agora')
    await symlink(join(box.config.path, 'ki/agoras/target.ki-agora'), linked)

    expect((await box.run('ki agora show missing')).output).toContain('no Agora profile')
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
      ['unsupported-primary', 'name = "Example"\ntool = "zed"\nprimary = "one"\n\n[projects]\none = "/one"', 'primary is no longer supported'],
      ['numeric-project', 'name = "Example"\ntool = "zed"\n\n[projects]\none = 1', 'project one must be a non-empty path'],
      ['empty-project', 'name = "Example"\ntool = "zed"\n\n[projects]\none = ""', 'project one must be a non-empty path'],
      ['relative-project', 'name = "Example"\ntool = "zed"\n\n[projects]\none = "relative"', 'project one path must be absolute'],
      ['duplicate-projects', 'name = "Example"\ntool = "zed"\n\n[projects]\none = "/same"\ntwo = "/same"', 'projects must not contain duplicate paths']
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
    expect(await box.run('ki agora open example')).toEqual({ exitCode: 7, output: 'ki: error: could not open Agora example: launch failed\n' })

    box.setRunner(async () => ({ exitCode: 8, output: '' }))
    expect(await box.run('ki agora open example')).toEqual({ exitCode: 8, output: 'ki: error: could not open Agora example: zed failed\n' })

    box.setRunner(async (_command, arguments_) => (arguments_[0] === '-n' ? { exitCode: 0, output: '' } : { exitCode: 9, output: 'project failed\n' }))
    expect(await box.run('ki agora open example')).toEqual({ exitCode: 9, output: 'ki: error: could not open Agora example: project failed\n' })

    box.setRunner(async (_command, arguments_) => (arguments_[0] === '-n' ? { exitCode: 0, output: '' } : { exitCode: 10, output: '' }))
    expect(await box.run('ki agora open example')).toEqual({ exitCode: 10, output: 'ki: error: could not open Agora example: zed failed\n' })
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

    expect(await box.run('ki agora create inventory')).toEqual({ exitCode: 0, output: 'ki agora create: created inventory\n' })
    expect(await box.run('ki agora add inventory first')).toEqual({ exitCode: 0, output: 'ki agora add: inventory now has 1 projects\n' })
    expect(await box.run('ki agora add inventory second')).toEqual({ exitCode: 0, output: 'ki agora add: inventory now has 2 projects\n' })
    expect(await box.run('ki agora add inventory dotted.project')).toEqual({ exitCode: 0, output: 'ki agora add: inventory now has 3 projects\n' })
    expect(await box.run('ki repo --agora inventory roadmap list')).toEqual({
      exitCode: 0,
      output: `╭─ KI REPO ROADMAP\n│  📁 dotted.project\n│     ${dotted}\n│  ✦ 0 items\n├─ results\n│  ╰─ ❌ repository ${dotted} has no physical docs/roadmap directory\n╰─ summary: ITEMS=0 HORIZONS=0\n\n╭─ KI REPO ROADMAP\n│  📁 first\n│     ${first}\n│  ✦ 0 items\n├─ results\n│  ╰─ ❌ repository ${first} has no physical docs/roadmap directory\n╰─ summary: ITEMS=0 HORIZONS=0\n\n╭─ KI REPO ROADMAP\n│  📁 second\n│     ${second}\n│  ✦ 0 items\n├─ results\n│  ╰─ ❌ repository ${second} has no physical docs/roadmap directory\n╰─ summary: ITEMS=0 HORIZONS=0\n`
    })
    expect(await box.run('ki agora remove inventory first')).toEqual({ exitCode: 0, output: 'ki agora remove: inventory now has 2 projects\n' })
    expect(await box.run('ki agora create discovered')).toEqual({ exitCode: 0, output: 'ki agora create: created discovered\n' })
    expect(await box.run('ki agora discover discovered nested')).toEqual({ exitCode: 0, output: 'ki agora discover: discovered now has 1 projects\n' })
    expect(await box.run('ki agora show discovered')).toEqual({
      exitCode: 0,
      output: `ki agora show discovered\n  discovered\n  tool zed\n  project ${third}\n`
    })
  })
})
