import { utimes } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from './_cli_helper.ts'

/** Writes a file under the agents directory, modified at the given minute past 19:00 UTC on 7 October. */
const written = async (box: Sandbox, file: string, minute: number, body = '# Brief\n'): Promise<string> => {
  await box.state.write(`ki/agents/${file}`, body)
  const at = new Date(`2026-10-07T19:${String(minute).padStart(2, '0')}:00Z`)
  await utimes(`${box.state.path}/ki/agents/${file}`, at, at)
  return `${box.state.path}/ki/agents/${file}`
}

describe('ki agent sweep', () => {
  test('reports nothing when no run has left anything behind', async () => {
    const box = await sandbox()
    const result = await box.run('ki agent sweep')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('Nothing to sweep\n')
  })

  test('keeps the newest closed runs in _archive/, removing each older run whole', async () => {
    const box = await sandbox()
    const archive = `${box.state.path}/ki/agents/_archive`
    await written(box, '_archive/newest.close.md', 40)
    await written(box, '_archive/packed.tar.gz', 30)
    await written(box, '_archive/packed.close.md', 30)
    await written(box, '_archive/alpha/close.md', 20)
    await written(box, '_archive/beta/close.md', 20)
    await written(box, '_archive/bare/events.jsonl', 50)
    await written(box, '_archive/notes.txt', 10)

    const preview = await box.run('ki agent sweep --keep 3')
    expect(preview.exitCode).toBe(0)
    expect(preview.stdout).toBe(
      `would remove ${archive}/bare\nwould remove ${archive}/beta\nPass --write to remove them\n`
    )
    expect(await box.state.read('ki/agents/_archive/beta/close.md')).toBe('# Brief\n')
    expect((await box.run('ki agent sweep')).stdout).toBe('Nothing to sweep\n')

    const swept = await box.run('ki agent sweep --keep 1 --write')
    expect(swept.stdout).toBe(
      [
        `removed ${archive}/alpha`,
        `removed ${archive}/bare`,
        `removed ${archive}/beta`,
        `removed ${archive}/packed.close.md`,
        `removed ${archive}/packed.tar.gz`,
        ''
      ].join('\n')
    )
    expect(await box.state.read('ki/agents/_archive/newest.close.md')).toBe('# Brief\n')
    expect(await box.state.read('ki/agents/_archive/notes.txt')).toBe('# Brief\n')
  })

  test('removes a queued or draft brief that a launched prompt holds, and no other', async () => {
    const box = await sandbox()
    const spent = await written(box, 'r/one.queued.md', 10)
    await written(box, 'r/one.prompt.md', 11)
    await written(box, 'r/two.prompt.md', 10)
    await written(box, 'r/two.draft.md', 12)
    await written(box, 'r/three.prompt.md', 10)
    await written(box, 'r/three.queued.md', 10)
    await written(box, 'r/queue.jsonl', 10, '{"name":"three"}\n')
    await written(box, 'r/four.queued.md', 10)
    const old = await written(box, 's/five.draft.md', 10)
    await written(box, 's/five.prompt.md', 10)
    await written(box, 'README.md', 10)

    expect((await box.run('ki agent sweep')).stdout).toBe(
      `would remove ${spent}\nwould remove ${old}\nPass --write to remove them\n`
    )
    expect((await box.run('ki agent sweep --write')).stdout).toBe(`removed ${spent}\nremoved ${old}\n`)
    expect(await box.state.read('ki/agents/r/one.prompt.md')).toBe('# Brief\n')
    for (const file of ['two.draft.md', 'three.queued.md', 'four.queued.md'])
      expect(await box.state.read(`ki/agents/r/${file}`)).toBe('# Brief\n')
  })

  test('rejects a keep below one', async () => {
    const box = await sandbox()
    const result = await box.run('ki agent sweep --keep 0')
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("expected a positive whole number, got '0'")
  })
})
