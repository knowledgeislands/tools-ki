import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

test('every workflow running upgrade regressions checks out baseline history', async () => {
  const directory = new URL('../../../.github/workflows/', import.meta.url)
  let suites = 0
  for (const name of await readdir(directory)) {
    const workflow = parse(await readFile(new URL(name, directory), 'utf8')) as {
      jobs: Record<string, { steps: { uses?: string; run?: string; with?: { 'fetch-depth'?: number } }[] }>
    }
    for (const [job, { steps }] of Object.entries(workflow.jobs)) {
      if (!steps.some((step) => /bun run test|ki repo audit/.test(step.run ?? ''))) continue
      suites += 1
      const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'))
      expect(checkout?.with?.['fetch-depth'], `${fileURLToPath(directory)}${name}: ${job}`).toBe(0)
    }
  }
  expect(suites).toBeGreaterThan(0)
})
