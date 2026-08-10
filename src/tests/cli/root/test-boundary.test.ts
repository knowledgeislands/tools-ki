import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

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

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/gu)].map((match) => match[1] as string)

const isWithin = (target: string, directory: string): boolean => {
  const distance = relative(directory, target)
  return distance === '' || (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance))
}

const productImportViolations = async (directory: string): Promise<string[]> => {
  const tests = resolve(directory)
  const source = resolve(tests, '../..')
  const helper = join(tests, '_cli_helper.ts')
  const productPaths = [
    join(source, 'agents'),
    join(source, 'commands'),
    join(source, 'core'),
    join(source, 'cli.ts'),
    join(source, 'context.ts'),
    join(source, 'main.ts'),
    join(source, 'version.ts')
  ]
  const imports = await Promise.all(
    (await testFiles(tests)).map(async (path) => ({ path, source: await readFile(path, 'utf8') }))
  )
  return imports
    .filter(
      ({ path, source: contents }) =>
        path !== helper &&
        importSpecifiers(contents).some((specifier) =>
          productPaths.some((product) => isWithin(resolve(dirname(path), specifier), product))
        )
    )
    .map(({ path }) => path)
}

describe('[CLI test boundary]', () => {
  test('allows product-code imports only in the shared CLI sandbox', async () => {
    expect(await productImportViolations('src/tests/cli')).toEqual([])
  })

  test('detects a nested relative import into product code', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ki-cli-boundary-'))
    temporaryDirectories.push(directory)
    const tests = join(directory, 'src/tests/cli')
    const violation = join(tests, 'nested/deep.test.ts')
    await mkdir(dirname(violation), { recursive: true })
    const from = String.fromCharCode(102, 114, 111, 109)
    await writeFile(violation, `${['import { run }', `${from} '../../../core/runtime.ts'`].join(' ')}\n`)

    expect(await productImportViolations(tests)).toEqual([violation])
  })
})
