import { realpath, writeFile } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const boundary = vi.hoisted(() => ({ mode: 'normal', pid: 987654, close: () => {}, failKill: false }))
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: (_command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      const child = new EventEmitter() as InstanceType<typeof EventEmitter> & {
        stdout: InstanceType<typeof EventEmitter>
        stderr: InstanceType<typeof EventEmitter>
        pid?: number
        kill: () => boolean
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.pid = boundary.pid || undefined
      const close = () => {
        queueMicrotask(() => child.emit('close', 0))
      }
      boundary.close = close
      child.kill = vi.fn(() => {
        close()
        return true
      })
      queueMicrotask(async () => {
        if (boundary.mode === 'hang') return
        if (boundary.mode === 'spawn-error') {
          child.emit('error', new Error('PRIVATE_RUNTIME_ERROR'))
          close()
          return
        }
        if (boundary.mode === 'null-close') {
          child.emit('close', null)
          return
        }
        if (boundary.mode === 'oversize') {
          child.stdout.emit('data', Buffer.alloc(2097153, 65))
          child.stderr.emit('data', Buffer.alloc(2097153, 65))
          close()
          return
        }
        if (args.includes('--version')) {
          child.stderr.emit('data', Buffer.from('progress'))
          child.stdout.emit('data', Buffer.from('qmd 2.8.3\n'))
        } else {
          await writeFile(options.env['INDEX_PATH']!, 'synthetic database')
        }
        close()
      })
      return child
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  boundary.mode = 'normal'
  boundary.pid = 987654
  boundary.failKill = false
})
const fixture = async () => {
  const box = await sandbox()
  await box.project.write(
    '.ki.toml',
    '[repo]\nharnesses = ["example/harness"]\n[skills.ki-repo-kb]\n[skills.ki-repo]\nrepo_type = "kb"\nprimary_shape = "ki-repo-kb"\nstore_roles = ["notes"]\nrepository = "https://github.com/example/alpha"\ntitle = "Alpha"\ndescription = "Synthetic runtime"\nrepo_code = "ALPHA"\nvisibility = "private"\n'
  )
  await box.project.write('Resources/Note.md', '# Synthetic\npublic fixture\n')
  await box.state.write(
    'ki/registry.toml',
    `schema = 1\n[repositories.alpha]\nrepository = "https://github.com/example/alpha"\npath = ${JSON.stringify(await realpath(box.project.path))}\nsearch_boundary = "alpha-owner"\n`
  )
  const cache = await box.root.mkdir('cache')
  await box.root.write('cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf', 'synthetic model')
  box.setEnv({ KI_STATE_HOME: await box.state.mkdir('ki'), KI_CACHE_HOME: cache })
  vi.spyOn(process, 'kill').mockImplementation(() => {
    if (boundary.failKill) throw Error('synthetic kill failure')
    boundary.close()
    return true
  })
  return box
}
test('bounded native stdout excludes stderr and successful execution publishes state', async () => {
  const box = await fixture()
  const result = await box.run('ki kb index --kb alpha', { runner: 'default' })
  expect(result.exitCode, result.output).toBe(0)
  expect(result.output).not.toContain('progress')
})
test('bounded native output stops the full process group without leaking bytes', async () => {
  const box = await fixture()
  boundary.mode = 'oversize'
  const result = await box.run('ki kb index --kb alpha', { runner: 'default' })
  expect(result.exitCode).toBe(1)
  expect(result.output.length).toBeLessThan(300)
  expect(process.kill).toHaveBeenCalledWith(-987654, 'SIGKILL')
})
test.each(['spawn-error', 'null-close'])('native %s stays unavailable and redacted', async (mode) => {
  const box = await fixture()
  boundary.mode = mode
  const result = await box.run('ki kb index --kb alpha', { runner: 'default' })
  expect(result.exitCode).toBe(1)
  expect(result.output).not.toContain('PRIVATE_RUNTIME')
})
test.each(['group', 'fallback', 'no-pid'])('native timeout %s ends execution and remains unavailable', async (kind) => {
  const box = await fixture()
  boundary.mode = 'hang'
  boundary.failKill = kind === 'fallback'
  boundary.pid = kind === 'no-pid' ? 0 : 987654
  const original = setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, ms: number) =>
    original(handler, ms === 10000 ? 5 : ms)) as typeof setTimeout)
  const result = await box.run('ki kb index --kb alpha', { runner: 'default' })
  expect(result.exitCode).toBe(1)
})
test('unsupported Windows native bounds fail closed before spawn', async () => {
  const box = await fixture()
  expect((await box.run('ki kb index --kb alpha', { runner: 'default', platform: 'win32' })).exitCode).toBe(1)
})
