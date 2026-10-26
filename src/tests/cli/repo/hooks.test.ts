import { lstat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

// Canonical hook publication retains bounded Husky retirement and Knip repairs in a committed
// `.githooks/` (KI-TOOL-KI-CLI-163). Real Git binds the fixture clone.

const rubric = `
export default {
  contract: 1,
  name: 'ki-repo',
  concern: 'repository registration',
  createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }),
  families: []
}
`

const declaration =
  '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\n'

const localConfiguration = 'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n'

const header = (hook: string): string[] => [
  '#!/bin/sh',
  `# Committed ${hook} gate, bound by \`core.hooksPath\` so every working tree runs it.`,
  '# Without its tools it refuses the commit rather than letting it pass unchecked.',
  'root="$(git rev-parse --show-toplevel)" || exit 1'
]

const nodeRefusal = (hook: string, tools: string): string[] => [
  "missing=''",
  `for tool in ${tools}; do`,
  '  [ -x "$root/node_modules/.bin/$tool" ] || missing="$missing $tool"',
  'done',
  'if [ -n "$missing" ]; then',
  `  echo "${hook}: the commit gate cannot run; missing from node_modules/.bin:$missing" >&2`,
  `  echo "${hook}: run \\\`bun install\\\` in $root, then commit again." >&2`,
  `  echo "${hook}: do not bypass with --no-verify; a gate that cannot run is unknown, not a pass." >&2`,
  '  exit 1',
  'fi'
]

const onPath = ['PATH="$root/node_modules/.bin:$PATH"', 'export PATH']

const lines = (...parts: readonly (readonly string[])[]): string => `${parts.flat().join('\n')}\n`

const toolsKiManifest = `{
  "name": "@example/project",
  "scripts": {
    "prepare": "husky && bun install --frozen-lockfile --cwd tooling/depcruise",
    "test": "vitest run"
  },
  "devDependencies": {
    "@biomejs/biome": "2.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.0.0"
  }
}
`

const toolsKiLock = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "@example/project",
      "devDependencies": {
        "@biomejs/biome": "2.0.0",
        "husky": "^9.1.7",
        "lint-staged": "^16.0.0",
      },
    },
  },
  "packages": {
    "@biomejs/biome": ["@biomejs/biome@2.0.0", "", {}, "sha512-a"],

    "husky": ["husky@9.1.7", "", { "bin": { "husky": "bin.js" } }, "sha512-b"],

    "lint-staged": ["lint-staged@16.0.0", "", {}, "sha512-c"],
  }
}
`

const toolsKi: Readonly<Record<string, string>> = {
  'package.json': toolsKiManifest,
  'bun.lock': toolsKiLock,
  '.husky/pre-commit': 'bunx lint-staged || exit 1\nbunx syncpack format --check || exit 1\n',
  '.husky/commit-msg': 'bunx commitlint --edit "$1" || exit 1\n',
  '.husky/_/husky.sh': '#!/usr/bin/env sh\n'
}

const setup = async (files: Readonly<Record<string, string>>, hooksPath?: string): Promise<Sandbox> => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.data.write(
    'ki/harnesses/example/harness/skills/ki-repo/scripts/rubric/contexts/canonical-hooks.ts',
    `export const canonicalHooks = () => (${JSON.stringify({ 'pre-commit': converted['.githooks/pre-commit'], 'commit-msg': converted['.githooks/commit-msg'] })})`
  )
  await box.config.write('ki/config.toml', localConfiguration)
  await box.project.write('.ki.toml', declaration)
  await box.project.git(['init', '-q'])
  for (const [path, content] of Object.entries(files)) await box.project.write(path, content)
  if (hooksPath) await box.project.git(['config', 'core.hooksPath', hooksPath])
  return box
}

const conform = (box: Sandbox, flags = '') => box.run(`ki repo conform${flags}`, { runner: 'default' })

const binding = (box: Sandbox): Promise<string> =>
  box.project.git(['config', '--get', 'core.hooksPath']).catch(() => '')

const exists = async (box: Sandbox, path: string): Promise<boolean> =>
  Boolean(await lstat(join(box.project.path, path)).catch(() => undefined))

const mode = async (box: Sandbox, path: string): Promise<number> =>
  (await lstat(join(box.project.path, path))).mode & 0o777

test('replaces Husky hooks canonically and retires package, lockfile, directory and binding', async () => {
  const box = await setup(toolsKi, '.husky/_')
  const preview = await conform(box, ' --dry-run')
  expect(preview.exitCode, preview.output).toBe(0)
  expect(preview.output).toContain('would remove .husky/')
  expect(await box.project.read('package.json')).toBe(toolsKiManifest)
  expect(await box.project.read('bun.lock')).toBe(toolsKiLock)
  expect(await exists(box, '.husky')).toBe(true)
  const result = await conform(box)
  expect(result.exitCode, result.output).toBe(0)
  expect(await box.project.read('.githooks/pre-commit')).toBe(converted['.githooks/pre-commit'])
  expect(await box.project.read('.githooks/commit-msg')).toBe(converted['.githooks/commit-msg'])
  expect(await mode(box, '.githooks/pre-commit')).toBe(0o755)
  expect(await mode(box, '.githooks/commit-msg')).toBe(0o755)
  const manifest = JSON.parse(await box.project.read('package.json'))
  expect(manifest.scripts.prepare).toBe(
    'git config core.hooksPath .githooks && bun install --frozen-lockfile --cwd tooling/depcruise'
  )
  expect(manifest.devDependencies).not.toHaveProperty('husky')
  expect(await box.project.read('bun.lock')).not.toContain('"husky"')
  expect(await exists(box, '.husky')).toBe(false)
  expect(await binding(box)).toBe('.githooks')
  expect((await conform(box)).output).not.toMatch(/^(?:write|remove|bind) /m)
})

test('retains an already bound prepare command after Husky', async () => {
  const box = await setup({
    'package.json': '{"scripts":{"prepare":"husky && git config core.hooksPath .githooks && custom"}}'
  })
  expect((await conform(box)).exitCode).toBe(0)
  expect(JSON.parse(await box.project.read('package.json')).scripts.prepare).toBe(
    'git config core.hooksPath .githooks && custom'
  )
})

test('a filtered conform does not publish hooks when ki-repo is not selected', async () => {
  const box = await setup(toolsKi)
  await box.setupExampleHarness({ name: 'ki-other', rubric: rubric.replace("'ki-repo'", "'ki-other'") })
  await box.project.write('.ki.toml', `${declaration}\n[skills.ki-other]\n`)
  expect((await box.run('ki repo conform --skill ki-other', { runner: 'default' })).exitCode).toBe(0)
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await exists(box, '.husky')).toBe(true)
})

test.each([
  [
    'missing scripts',
    '{"devDependencies":{"husky":"9"}}',
    '{"devDependencies":{},"scripts":{"prepare":"git config core.hooksPath .githooks"}}'
  ],
  [
    'missing prepare',
    '{"scripts":{},"dependencies":{"husky":"9"}}',
    '{"scripts":{"prepare":"git config core.hooksPath .githooks"},"dependencies":{}}'
  ],
  [
    'plain husky',
    '{"scripts":{"prepare":"husky install"}}',
    '{"scripts":{"prepare":"git config core.hooksPath .githooks"}}'
  ],
  ['existing prepare', '{"scripts":{"prepare":"lefthook install"}}', '{"scripts":{"prepare":"lefthook install"}}'],
  [
    'absent prepare without husky',
    '{"name":"plain"}',
    '{"name":"plain","scripts":{"prepare":"git config core.hooksPath .githooks"}}'
  ]
])('repairs package prepare: %s', async (_name, source, expected) => {
  const box = await setup({ 'package.json': source, '.husky/_/husky.sh': '' })
  const result = await conform(box)
  expect(result.exitCode, result.output).toBe(0)
  expect(await box.project.read('package.json')).toBe(expected)
})

const refusals: readonly (readonly [string, Readonly<Record<string, string>>, string])[] = [
  ['extra hook', { '.husky/pre-push': 'custom' }, '.husky/pre-push'],
  ['not JSON', { 'package.json': '{' }, 'package.json is not a JSON object'],
  ['JSON scalar', { 'package.json': 'null' }, 'package.json is not a JSON object'],
  ['non-string prepare', { 'package.json': '{"scripts":{"prepare":1}}' }, 'package.json `prepare` is not a string'],
  [
    'Husky elsewhere',
    { 'package.json': '{"scripts":{"prepare":"bun x husky"}}' },
    'package.json `prepare` calls Husky'
  ],
  ['Husky twice', { 'package.json': '{"scripts":{"prepare":"husky && husky"}}' }, 'package.json `prepare` calls Husky'],
  [
    'another lockfile',
    { 'package.json': '{"devDependencies":{"husky":"9"}}', 'yarn.lock': '' },
    'yarn.lock still locks husky'
  ],
  [
    'indirect husky lock',
    { 'package.json': '{"devDependencies":{"husky":"9"}}', 'bun.lock': '{"other":"husky"}' },
    'bun.lock names husky beyond'
  ]
]
test.each(refusals)('refuses %s before any hook publication', async (_name, files, reason) => {
  const box = await setup(files)
  const result = await conform(box)
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain(reason)
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await binding(box)).toBe('')
})

test('refuses a symlinked Husky directory', async () => {
  const box = await setup({ 'elsewhere/pre-commit': 'custom' })
  await symlink('elsewhere', join(box.project.path, '.husky'))
  const result = await conform(box)
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('.husky is not a directory')
})

test('a lockless package drops husky without a lockfile edit', async () => {
  const box = await setup({
    'package.json': '{"devDependencies":{"husky":"9"}}',
    '.husky/pre-commit': 'bunx lint-staged\n',
    'bun.lock': '{}\n'
  })

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(result.output).not.toContain('write bun.lock')
  expect(await box.project.read('bun.lock')).toBe('{}\n')
})

test('a failed binding is reported', async () => {
  const box = await setup({ '.husky/pre-commit': 'make\n' })
  box.setRunner(async (command, arguments_) =>
    arguments_.includes('--get')
      ? { exitCode: 1, output: '' }
      : command === 'git' && arguments_.at(-1) === '.githooks'
        ? { exitCode: 255, output: 'could not lock config file\n' }
        : { exitCode: 1, output: '' }
  )

  const result = await box.run('ki repo conform')

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('could not bind core.hooksPath: could not lock config file')
})

// Knip's Husky plugin reads the committed hooks once Husky has gone (KI-TOOL-KI-CLI-167).
const huskyJson = '"husky": { "config": [".githooks/pre-commit", ".githooks/commit-msg"] }'
const huskyTs = (quote: string) =>
  `husky: { config: [${quote}.githooks/pre-commit${quote}, ${quote}.githooks/commit-msg${quote}] },`

const converted: Readonly<Record<string, string>> = {
  'package.json': '{"devDependencies":{"lint-staged":"16"}}\n',
  '.githooks/pre-commit': lines(header('pre-commit'), nodeRefusal('pre-commit', 'lint-staged syncpack'), onPath, [
    'lint-staged || exit 1',
    'syncpack format --check || exit 1'
  ]),
  '.githooks/commit-msg': lines(header('commit-msg'), nodeRefusal('commit-msg', 'commitlint'), onPath, [
    'commitlint --edit "$1" || exit 1'
  ])
}

const toolsKiKnip = `{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["bin/ki", "src/cli.ts"],
  "ignoreBinaries": ["mandoc", "mkfifo"],
  "ignoreDependencies": ["@commitlint/cli", "lint-staged", "syncpack"],
  "ignoreExportsUsedInFile": true
}
`

const kiPrincipalKnip = `import type { KnipConfig } from 'knip'

// ki-principal is a Markdown knowledge base — no application source of its own.
const config: KnipConfig = {
  ignore: ['.obsidian/**', '.claude/skills/**', '.agents/skills/**'],
  ignoreDependencies: ['@commitlint/cli', 'lint-staged', 'syncpack'],
  ignoreExportsUsedInFile: true
}

export default config
`

test('a conversion points knip.json at the committed hooks and drops the ignores they make redundant', async () => {
  const box = await setup({ ...toolsKi, 'knip.json': toolsKiKnip }, '.husky/_')

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(result.output).toContain('write knip.json\n')
  expect(await box.project.read('knip.json')).toBe(`{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["bin/ki", "src/cli.ts"],
  "ignoreBinaries": ["mandoc", "mkfifo"],
  "ignoreExportsUsedInFile": true,
  ${huskyJson}
}
`)

  const repeated = await conform(box)
  expect(repeated.exitCode).toBe(0)
  expect(repeated.output).not.toContain('write knip.json')
})

test('a converted repository gains the Knip configuration, keeping other ignores and their layout', async () => {
  const knip = `{
  "ignoreDependencies": [
    "googleapis",
    "lint-staged"
  ],
  "entry": ["src/index.ts"]
}
`
  const unread = 'export default defineConfig({})\n'
  const box = await setup({ ...converted, 'knip.json': knip, 'knip.ts': unread }, '.githooks')

  const dry = await conform(box, ' --dry-run')
  expect(dry.exitCode).toBe(0)
  expect(dry.output).toContain('would write knip.json\n')
  expect(await box.project.read('knip.json')).toBe(knip)

  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('knip.json')).toBe(`{
  "ignoreDependencies": [
    "googleapis"
  ],
  "entry": ["src/index.ts"],
  ${huskyJson}
}
`)
  expect(await box.project.read('knip.ts')).toBe(unread)
})

test('knip.json on one line, empty or already configured, is edited in place', async () => {
  const empty = await setup({ ...converted, 'knip.json': '{}\n' }, '.githooks')
  expect((await conform(empty)).exitCode).toBe(0)
  expect(await empty.project.read('knip.json')).toBe(`{ ${huskyJson} }\n`)

  const configured = await setup(
    {
      ...converted,
      'knip.json':
        '{"husky":{"config":[".githooks/pre-commit",".githooks/commit-msg"]},"ignoreDependencies":["syncpack"]}'
    },
    '.githooks'
  )
  expect((await conform(configured)).exitCode).toBe(0)
  expect(await configured.project.read('knip.json')).toBe(
    '{"husky":{"config":[".githooks/pre-commit",".githooks/commit-msg"]}}'
  )
})

test('the root workspace loses its redundant ignores too, and other workspaces keep theirs', async () => {
  const oneLine = await setup(
    {
      ...converted,
      'knip.json':
        '{"workspaces":{"packages/*":{"ignoreDependencies":["tailwindcss"]},".":{"ignoreDependencies":["@commitlint/cli","lint-staged","syncpack"]}},"ignore":[".agents/skills"]}'
    },
    '.githooks'
  )
  expect((await conform(oneLine)).exitCode).toBe(0)
  expect(await oneLine.project.read('knip.json')).toBe(
    `{"workspaces":{"packages/*":{"ignoreDependencies":["tailwindcss"]},".":{}},"ignore":[".agents/skills"], ${huskyJson} }`
  )

  const knip = `{
  "ignoreDependencies": ["tailwindcss"],
  "workspaces": {
    ".": {
      "entry": ["scripts/*.ts"],
      "ignoreDependencies": [
        "@commitlint/cli",
        "lint-staged"
      ]
    }
  }
}
`
  const pretty = await setup({ ...converted, 'knip.json': knip }, '.githooks')
  expect((await conform(pretty)).exitCode).toBe(0)
  expect(await pretty.project.read('knip.json')).toBe(`{
  "ignoreDependencies": ["tailwindcss"],
  "workspaces": {
    ".": {
      "entry": ["scripts/*.ts"]
    }
  },
  ${huskyJson}
}
`)
})

test('knip.ts gains husky as its first member and loses the redundant ignores', async () => {
  const box = await setup({ ...converted, 'knip.ts': kiPrincipalKnip }, '.githooks')

  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('knip.ts')).toBe(
    kiPrincipalKnip
      .replace('const config: KnipConfig = {\n', `const config: KnipConfig = {\n  ${huskyTs("'")}\n`)
      .replace("  ignoreDependencies: ['@commitlint/cli', 'lint-staged', 'syncpack'],\n", '')
  )

  const repeated = await conform(box)
  expect(repeated.exitCode).toBe(0)
  expect(repeated.output).not.toContain('write knip.ts')
})

const knipTsEdits: readonly (readonly [string, string, string])[] = [
  [
    'an object with no strings or ignores',
    'export default {\n  ignoreExportsUsedInFile: true\n}\n',
    `export default {\n  ${huskyTs("'")}\n  ignoreExportsUsedInFile: true\n}\n`
  ],
  [
    'an existing husky and a last-member array that keeps an entry',
    `export default {\n  ${huskyTs('"')}\n  ignoreDependencies: ["googleapis", "syncpack"]\n}\n`,
    `export default {\n  ${huskyTs('"')}\n  ignoreDependencies: ["googleapis"]\n}\n`
  ],
  [
    'a last-member array that empties',
    "export default {\n  ignore: ['x'],\n  ignoreDependencies: ['lint-staged']\n}\n",
    `export default {\n  ${huskyTs("'")}\n  ignore: ['x']\n}\n`
  ]
]

test.each(knipTsEdits)('knip.ts: %s', async (_, source, expected) => {
  const box = await setup({ ...converted, 'knip.ts': source }, '.githooks')

  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('knip.ts')).toBe(expected)
})

const knipRefusals: readonly (readonly [string, string, string, string])[] = [
  ['a conflicting husky in knip.json', 'knip.json', '{"husky":false}', 'knip.json configures husky otherwise'],
  ['a knip.json that is not an object', 'knip.json', '[]', 'knip.json is not a JSON object'],
  ['a knip.json that is not JSON', 'knip.json', '{', 'knip.json is not a JSON object'],
  [
    'a knip.json edit that would not round-trip',
    'knip.json',
    '{"workspaces":{"packages/*":{"ignoreDependencies":["lint-staged"]}},"ignoreDependencies":["lint-staged"]}',
    'knip.json is laid out in a way the conversion cannot edit'
  ],
  [
    'a conflicting husky in knip.ts',
    'knip.ts',
    'const config = {\n  husky: false,\n  ignoreExportsUsedInFile: true\n}\nexport default config\n',
    'knip.ts configures husky otherwise'
  ],
  [
    'a knip.ts without an object literal',
    'knip.ts',
    'export default defineConfig({\n  entry: []\n})\n',
    'knip.ts is not an object literal the conversion can edit'
  ],
  [
    'an empty knip.ts object',
    'knip.ts',
    'export default {\n}\n',
    'knip.ts is not an object literal the conversion can edit'
  ],
  [
    'a multi-line knip.ts array',
    'knip.ts',
    "export default {\n  ignoreDependencies: [\n    'lint-staged'\n  ]\n}\n",
    'knip.ts is not an object literal the conversion can edit'
  ],
  [
    'two knip.ts arrays',
    'knip.ts',
    "export default {\n  ignoreDependencies: ['a'],\n  workspaces: { '.': {\n    ignoreDependencies: ['b'],\n  } }\n}\n",
    'knip.ts is not an object literal the conversion can edit'
  ],
  [
    'a knip.ts array that is not all literals',
    'knip.ts',
    "export default {\n  ignoreDependencies: [...base, 'lint-staged']\n}\n",
    'knip.ts is not an object literal the conversion can edit'
  ]
]

test.each(knipRefusals)('refuses %s and changes nothing', async (_, path, source, reason) => {
  const box = await setup({ ...toolsKi, [path]: source }, '.husky/_')

  const result = await conform(box)

  expect(result).toEqual({
    exitCode: 1,
    output: expect.stringContaining(`hook conversion refused: ${reason}; nothing was changed`)
  })
  expect(result.output).toContain("point Knip's `husky.config` at the committed hooks by hand")
  expect(await box.project.read(path)).toBe(source)
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await binding(box)).toBe('.husky/_')
})

test.each([
  '.husky/pre-commit/notes.md',
  '.husky/commit-msg/notes.md',
  '.husky/_/notes.md',
  '.husky/_/h/notes.md',
  '.husky/_/pre-commit/notes.md'
])('refuses to retire a Husky tree containing %s', async (path) => {
  const source = 'Unrelated notes that must survive\n'
  const manifest = '{"scripts":{"prepare":"husky"},"devDependencies":{"husky":"9"}}\n'
  const box = await setup({ [path]: source, 'package.json': manifest }, '.husky/_')
  for (const flags of [' --dry-run', '']) {
    const result = await conform(box, flags)
    expect(result.exitCode, result.output).toBe(1)
    expect(result.output).toContain('hook conversion refused:')
    expect(result.output).not.toContain('remove .husky\n')
    expect(await box.project.read(path)).toBe(source)
    expect(await box.project.read('package.json')).toBe(manifest)
    expect(await exists(box, '.githooks')).toBe(false)
    expect(await binding(box)).toBe('.husky/_')
  }
})

test.each(['.husky/pre-commit', '.husky/_', '.husky/_/h'])(
  'refuses to retire a Husky tree with a symlink at %s',
  async (path) => {
    const box = await setup({ 'notes.md': 'Keep me\n' }, '.husky/_')
    await box.project.mkdir(path.slice(0, path.lastIndexOf('/')))
    await symlink(join(box.project.path, 'notes.md'), join(box.project.path, path))
    const result = await conform(box, ' --dry-run')
    expect(result.exitCode, result.output).toBe(1)
    expect(result.output).toContain('hook conversion refused:')
    expect(await box.project.isSymlink(path)).toBe(true)
    expect(await box.project.read('notes.md')).toBe('Keep me\n')
    expect(await exists(box, '.githooks')).toBe(false)
    expect(await binding(box)).toBe('.husky/_')
  }
)

test('refuses a regular file in place of the generated Husky directory', async () => {
  const box = await setup({ '.husky/_': 'Keep me\n' }, '.husky/_')
  const result = await conform(box, ' --dry-run')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('.husky/_ is not a directory')
  expect(await box.project.read('.husky/_')).toBe('Keep me\n')
  expect(await exists(box, '.githooks')).toBe(false)
})

test('retires only regular generated Husky entries', async () => {
  const box = await setup({
    '.husky/_/.gitignore': '*\n',
    '.husky/_/h': '#!/bin/sh\n',
    '.husky/_/pre-commit': '#!/bin/sh\n',
    '.husky/_/pre-push': '#!/bin/sh\n'
  })
  expect((await conform(box)).exitCode).toBe(0)
  expect(await exists(box, '.husky')).toBe(false)
})

test.each([
  [
    'a helper object before a separate default object',
    "const helper = {\n  ignoreDependencies: ['lint-staged'],\n}\nexport default {\n  entry: ['src/main.ts'],\n}\n"
  ],
  [
    'a helper object before an exported named configuration',
    "const helper = {\n  entry: ['helper.ts'],\n}\nconst config = {\n  ignoreDependencies: ['lint-staged'],\n}\nexport default config\n"
  ],
  [
    'an inline helper before the default object',
    "const helper = { ignoreDependencies: ['lint-staged'] }\nexport default {\n  entry: ['src/main.ts'],\n}\n"
  ],
  ['an unexported object', "const config = {\n  entry: ['src/main.ts'],\n}\n"],
  ['a different exported identifier', "const helper = {\n  entry: ['helper.ts'],\n}\nexport default config\n"],
  ['a missing closing brace', "export default {\n  entry: ['src/main.ts'],\n"],
  [
    'a nested unrelated ignore list',
    "export default {\n  workspaces: { '.': {\n    ignoreDependencies: ['lint-staged'],\n  } },\n}\n"
  ]
])('refuses ambiguous Knip configuration: %s', async (_name, source) => {
  const box = await setup({ ...toolsKi, 'knip.ts': source }, '.husky/_')
  for (const flags of [' --dry-run', '']) {
    const result = await conform(box, flags)
    expect(result.exitCode, result.output).toBe(1)
    expect(result.output).toContain('knip.ts is not an object literal the conversion can edit')
    expect(await box.project.read('knip.ts')).toBe(source)
    expect(await box.project.read('package.json')).toBe(toolsKiManifest)
    expect(await box.project.read('bun.lock')).toBe(toolsKiLock)
    expect(await exists(box, '.githooks')).toBe(false)
    expect(await exists(box, '.husky')).toBe(true)
    expect(await binding(box)).toBe('.husky/_')
  }
})

test('repairs a named exported Knip configuration with comments and blank lines', async () => {
  const source =
    '// Configuration\n\nconst config = {\n  // Keep this comment\n\n  ignoreExportsUsedInFile: true\n}\nexport default config;\n'
  const box = await setup({ ...converted, 'knip.ts': source }, '.githooks')
  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('knip.ts')).toBe(
    source.replace('const config = {\n', `const config = {\n  ${huskyTs("'")}\n`)
  )
})

test('refuses duplicate root Knip ignore arrays', async () => {
  const source = "export default {\n  ignoreDependencies: ['a'],\n  ignoreDependencies: ['b'],\n}\n"
  const box = await setup({ ...converted, 'knip.ts': source })
  const result = await conform(box, ' --dry-run')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('knip.ts is not an object literal the conversion can edit')
  expect(await box.project.read('knip.ts')).toBe(source)
})
