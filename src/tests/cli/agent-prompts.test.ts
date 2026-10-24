import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from './_cli_helper.ts'
import { registerEstate, writeCapital } from './_territory_helper.ts'

const now = () => Date.parse('2026-10-24T09:00:00Z')

const work = (box: Sandbox, id: string, fields: Readonly<Record<string, string>>) =>
  box.project.write(
    `capital/+/_WORK/${id}/work.md`,
    `---\n${Object.entries({
      id,
      worker: 'agent',
      supervisor: 'owner',
      state: 'with-supervisor',
      since: '2026-10-24T08:00:00Z',
      ...fields
    })
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}\n---\n\n# ${id}\n`
  )

const territory = async (): Promise<Sandbox> => {
  const box = await sandbox()
  await registerEstate(box, [await writeCapital(box)])
  await work(box, 'ex', { level: 'territory', title: "'EX > SoP'", label: "'EX > SoP (host)'" })
  await work(box, 'ex.sop.sites', {
    level: 'territory',
    title: "'EX > SoP (sites)'",
    parent: 'ex',
    covers: '[ex.site-home]'
  })
  await work(box, 'ex.site-home', { level: 'project', title: "'EX > Sites > Home'" })
  await work(box, 'ex.tools', { level: 'project', title: "'EX > Tools'" })
  await work(box, 'ex.vague', { level: 'project', title: "'EX > Vague'", state: 'pending' })
  await work(box, 'ex.old', { level: 'project', title: "'EX > Old'", state: 'finished' })
  await work(box, 'ex.regular.tidy', { level: 'regular', title: "'EX > Tidy'" })
  // Folders with no readable definition have no thread.
  await box.project.write('capital/+/_WORK/ex.empty/notes.md', '# notes\n')
  await box.project.write('capital/+/_WORK/ex.bare/work.md', '# ex.bare\n')
  await work(box, 'ex.sop.proj', { level: 'project', title: "'EX > Misplaced'" })
  return box
}

describe('ki agent prompts', () => {
  test("prints each coordination thread's opener, main first, then secondaries, then Project work", async () => {
    const box = await territory()

    const result = await box.run('ki agent prompts capital', { now })

    expect(result.exitCode).toBe(0)
    const headings = result.stdout.split('\n').filter((line) => line.startsWith('# '))
    expect(headings).toEqual([
      '# EX > SoP (host) · ex · State of play · with-supervisor',
      '# EX > SoP (sites) · ex.sop.sites · secondary State of play under ex · with-supervisor',
      '# EX > Sites > Home · ex.site-home · Project work under ex.sop.sites · with-supervisor',
      '# EX > Tools · ex.tools · Project work · with-supervisor',
      '# EX > Vague · ex.vague · Project work · state unreadable'
    ])
    expect(result.stdout).toContain(
      [
        'Bootstrap as ex territory work under ki-coordination.',
        'Role: coordinator only. The coordinator never does substantive work itself; every unit of work goes to a detached background agent; an owner message never pre-empts work in flight. Dispatch, decide with me, report; stay responsive.',
        'Label: EX > SoP (host). Work package: +/_WORK/ex/ in capital.',
        'Project management only: priorities, the Project-work queue (cap three or four), decisions and releases; route real work to Project work.',
        'Background agents: run substantive work through `ki agent` in run `ex`; stay responsive.',
        'Steering: my messages steer; stop or abort only when I expressly say so, naming the work.',
        'First step: follow the Bootstrap in ki-coordination, then report in three lines.'
      ].join('\n')
    )
    expect(result.stdout).toContain('Bootstrap as ex.sop.sites territory work under ki-coordination.')
    expect(result.stdout).toContain('Secondary State of play under EX > SoP (host) (ex):')
    expect(result.stdout).toContain('in run `ex-sop-sites`')
    expect(result.stdout).toContain('Bootstrap as ex.site-home Project work under ki-coordination.\nRole:')
    expect(result.stdout).toContain("Project: site-home; work only this Project's records.")
    expect(result.stdout).not.toContain('ex.old')
    expect(result.stdout).not.toContain('ex.regular.tidy')
  })

  test('prints the one-line re-bootstrap form with --short and the versioned JSON with --format json', async () => {
    const box = await territory()

    const short = await box.run('ki agent prompts capital --short', { now })
    const json = await box.run('ki agent prompts capital --format json', { now })

    expect(short.stdout).toContain(
      '# EX > SoP (sites) · ex.sop.sites · secondary State of play under ex · with-supervisor\n\nRe-bootstrap as ex.sop.sites under ki-coordination.\n'
    )
    expect(short.stdout).not.toContain('Role:')
    const report = JSON.parse(json.stdout)
    expect(report).toMatchObject({ schema: 'ki/agent-prompts/v1', repository: 'example/capital' })
    expect(report.threads.map((thread: { id: string; kind: string }) => [thread.id, thread.kind])).toEqual([
      ['ex', 'state-of-play'],
      ['ex.sop.sites', 'secondary'],
      ['ex.site-home', 'project'],
      ['ex.tools', 'project'],
      ['ex.vague', 'project']
    ])
    expect(report.threads[1]).toMatchObject({ label: 'EX > SoP (sites)', parent: 'ex' })
  })

  test('names the territory in a secondary opener when the main State of play is absent', async () => {
    const box = await sandbox()
    await registerEstate(box, [await writeCapital(box)])
    await work(box, 'ex.sop.sites', {
      level: 'territory',
      title: "'EX > SoP (sites)'",
      parent: 'ex',
      covers: '[ex.site-home]'
    })

    const result = await box.run('ki agent prompts capital', { now })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Secondary State of play under ex (ex):')
  })

  test('says so when the territory has no coordination threads', async () => {
    const box = await sandbox()
    await registerEstate(box, [await writeCapital(box)])
    await work(box, 'ex.regular.tidy', { level: 'regular', title: "'EX > Tidy'" })

    const result = await box.run('ki agent prompts capital', { now })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('no coordination threads in example/capital\n')
  })

  test('selects the territory by its work id or the working directory, and fails on an unknown territory', async () => {
    const box = await territory()

    const byWork = await box.run('ki agent prompts ex --short', { now })
    box.cd('capital')
    const local = await box.run('ki agent prompts --short', { now })
    const unknown = await box.run('ki agent prompts nowhere', { now })
    const malformed = await box.run('ki agent prompts Bad.Id', { now })

    expect(byWork.exitCode).toBe(0)
    expect(byWork.stdout).toContain('Re-bootstrap as ex.sop.sites under ki-coordination.')
    expect(local.exitCode).toBe(0)
    expect(local.stdout).toContain('Re-bootstrap as ex under ki-coordination.')
    expect(unknown.exitCode).toBe(2)
    expect(malformed.exitCode).toBe(2)
  })
})
