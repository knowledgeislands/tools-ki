import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const testFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return testFiles(path)
        return entry.name.endsWith('.test.ts') ? [path] : []
      })
    )
  ).flat()
}

describe('[CLI test boundary]', () => {
  test('allows product-code imports only in the shared CLI sandbox', async () => {
    const imports = await Promise.all((await testFiles('src/tests/cli')).map(async (path) => ({ path, source: await readFile(path, 'utf8') })))
    const productImport = /from ['"]\.\.\/\.\.\/(?:agents|commands|core|cli|context|main|version)\.ts['"]/u
    const violations = imports.filter(({ path, source }) => path !== 'src/tests/cli/_cli_helper.ts' && productImport.test(source)).map(({ path }) => path)

    expect(violations).toEqual([])
  })
})
