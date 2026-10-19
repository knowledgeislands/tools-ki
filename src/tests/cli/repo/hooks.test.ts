import { lstat, mkdir, readdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

// `ki repo conform` with ki-repo selected moves a Husky commit gate into a committed
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

// The frame lines ki-repo HOOK-4 accepts before a hook's content (ki-agentic-harness 95a1ab58).
const FRAME_LINE =
  /^(?:#|$|root=|missing=|for\s+tool\s+in\b|done\b|\[|test\s|if\b|then\b|elif\b|else\b|fi\b|echo\b|printf\b|exit\b|(?:export\s+)?PATH=|export\s+PATH\b)/

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

const commandRefusal = (hook: string, tools: string): string[] => [
  "missing=''",
  `for tool in ${tools}; do`,
  '  if ! command -v "$tool" >/dev/null 2>&1; then missing="$missing $tool"; fi',
  'done',
  'if [ -n "$missing" ]; then',
  `  echo "${hook}: the commit gate cannot run; not on PATH:$missing" >&2`,
  `  echo "${hook}: install them, then commit again." >&2`,
  `  echo "${hook}: do not bypass with --no-verify; a gate that cannot run is unknown, not a pass." >&2`,
  '  exit 1',
  'fi'
]

const onPath = ['PATH="$root/node_modules/.bin:$PATH"', 'export PATH']

const lines = (...parts: readonly (readonly string[])[]): string => `${parts.flat().join('\n')}\n`

const toolsKiManifest = `{
  "name": "@example/project",
  "scripts": {
    "prepare": "husky && bun install --frozen-lockfile --cwd tooling/boundaries",
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

const kiPrincipalPreCommit = `#!/bin/sh
# Committed pre-commit gate: refuse when its tools are missing, then run Husky and the KB audit.
root="$(git rev-parse --show-toplevel)" || exit 1
missing=''
for tool in lint-staged syncpack; do
  [ -x "$root/node_modules/.bin/$tool" ] || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  echo "pre-commit: missing:$missing" >&2
  echo "pre-commit: run bun install" >&2
  echo "pre-commit: do not bypass with --no-verify; a gate that cannot run is unknown, not a pass." >&2
  exit 1
fi
if ! command -v ki >/dev/null 2>&1; then
  echo "pre-commit: ki is not on PATH" >&2
  echo "pre-commit: install ki" >&2
  echo "pre-commit: do not bypass with --no-verify; a gate that cannot run is unknown, not a pass." >&2
  exit 1
fi
PATH="$root/node_modules/.bin:$PATH"
export PATH

sh "$root/.husky/pre-commit" "$@" || exit 1

# The KB audit, quiet when it passes.
ki repo audit --repo "$root" --skill ki-repo-kb --staged \\
  --concise --progress never --reporter-levels FAIL && exit 0
ki repo audit --repo "$root" --skill ki-repo-kb --staged
exit 1
`

const kiPrincipalCommitMessage = `#!/bin/sh
root="$(git rev-parse --show-toplevel)" || exit 1
missing=''
for tool in commitlint; do
  [ -x "$root/node_modules/.bin/$tool" ] || missing="$missing $tool"
done
for tool in ki; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  echo "commit-msg: missing:$missing" >&2
  exit 1
fi
exec sh "$root/.husky/commit-msg" "$@"
`

const kiPrincipal: Readonly<Record<string, string>> = {
  'package.json': `{\n\t"name": "ki-principal",\n\t"scripts": {\n\t\t"prepare": "husky && git config core.hooksPath .githooks"\n\t},\n\t"devDependencies": {\n\t\t"husky": "^9.1.7"\n\t}\n}\n`,
  '.githooks/pre-commit': kiPrincipalPreCommit,
  '.githooks/commit-msg': kiPrincipalCommitMessage,
  '.husky/pre-commit':
    '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nbunx lint-staged --quiet || exit 1\nbunx syncpack format --check || exit 1\n',
  '.husky/commit-msg': 'bunx commitlint --edit "$1" || exit 1\n'
}

const setup = async (files: Readonly<Record<string, string>>, hooksPath?: string): Promise<Sandbox> => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
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

const frameEnd = (hook: string): number => hook.split('\n').findIndex((line) => !FRAME_LINE.test(line.trim()))

test('converts a Husky-only repository: frame-first hooks, prepare, manifest, lockfile, .husky/ and the binding', async () => {
  const box = await setup(toolsKi, '.husky/_')

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(result.output).toContain('write .githooks/pre-commit\n')
  expect(result.output).toContain('write .githooks/commit-msg\n')
  expect(result.output).toContain('write package.json\n')
  expect(result.output).toContain('write bun.lock\n')
  expect(result.output).toContain('remove .husky/\n')
  expect(result.output).toContain('bind core.hooksPath .githooks (was .husky/_)\n')
  const preCommit = await box.project.read('.githooks/pre-commit')
  expect(preCommit).toBe(
    lines(header('pre-commit'), nodeRefusal('pre-commit', 'lint-staged syncpack'), onPath, [
      'lint-staged || exit 1',
      'syncpack format --check || exit 1'
    ])
  )
  expect(preCommit.split('\n')[frameEnd(preCommit)]).toBe('lint-staged || exit 1')
  expect(await box.project.read('.githooks/commit-msg')).toBe(
    lines(header('commit-msg'), nodeRefusal('commit-msg', 'commitlint'), onPath, ['commitlint --edit "$1" || exit 1'])
  )
  expect(await mode(box, '.githooks/pre-commit')).toBe(0o755)
  expect(await mode(box, '.githooks/commit-msg')).toBe(0o755)
  expect(JSON.parse(await box.project.read('package.json'))).toEqual({
    name: '@example/project',
    scripts: {
      prepare: 'git config core.hooksPath .githooks && bun install --frozen-lockfile --cwd tooling/boundaries',
      test: 'vitest run'
    },
    devDependencies: { '@biomejs/biome': '2.0.0', 'lint-staged': '^16.0.0' }
  })
  expect(await box.project.read('package.json')).toMatch(/^\{\n {2}"name"/)
  expect(await box.project.read('bun.lock')).toBe(
    toolsKiLock
      .replace('        "husky": "^9.1.7",\n', '')
      .replace('    "husky": ["husky@9.1.7", "", { "bin": { "husky": "bin.js" } }, "sha512-b"],\n\n', '')
  )
  expect(await exists(box, '.husky')).toBe(false)
  expect(await binding(box)).toBe('.githooks')

  const repeated = await conform(box)
  expect(repeated.exitCode).toBe(0)
  expect(repeated.output).not.toMatch(/^(?:write|remove|bind) /m)
  expect(await box.project.read('.githooks/pre-commit')).toBe(preCommit)
})

test('inlines Husky into committed stubs, keeping the KB audit and the binding prepare', async () => {
  const box = await setup(kiPrincipal, '.githooks')

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(result.output).not.toContain('bind core.hooksPath')
  const preCommit = await box.project.read('.githooks/pre-commit')
  expect(preCommit).toBe(
    lines(
      header('pre-commit'),
      nodeRefusal('pre-commit', 'lint-staged syncpack'),
      commandRefusal('pre-commit', 'ki'),
      onPath,
      [
        'lint-staged --quiet || exit 1',
        'syncpack format --check || exit 1',
        '',
        '# The KB audit, quiet when it passes.',
        'ki repo audit --repo "$root" --skill ki-repo-kb --staged \\',
        '  --concise --progress never --reporter-levels FAIL && exit 0',
        'ki repo audit --repo "$root" --skill ki-repo-kb --staged',
        'exit 1'
      ]
    )
  )
  expect(preCommit.split('\n')[frameEnd(preCommit)]).toBe('lint-staged --quiet || exit 1')
  expect(await box.project.read('.githooks/commit-msg')).toBe(
    lines(header('commit-msg'), nodeRefusal('commit-msg', 'commitlint'), commandRefusal('commit-msg', 'ki'), onPath, [
      'commitlint --edit "$1" || exit 1'
    ])
  )
  expect(await box.project.read('package.json')).toBe(
    '{\n\t"name": "ki-principal",\n\t"scripts": {\n\t\t"prepare": "git config core.hooksPath .githooks"\n\t},\n\t"devDependencies": {}\n}\n'
  )
  expect(await exists(box, '.husky')).toBe(false)
  expect(await binding(box)).toBe('.githooks')
})

test('a dry run reports every change and makes none', async () => {
  const box = await setup(toolsKi)

  const result = await conform(box, ' --dry-run')

  expect(result.exitCode).toBe(0)
  for (const line of [
    'would write .githooks/pre-commit',
    'would write .githooks/commit-msg',
    'would write package.json',
    'would write bun.lock',
    'would remove .husky/',
    'would bind core.hooksPath .githooks'
  ])
    expect(result.output).toContain(`${line}\n`)
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await box.project.read('package.json')).toBe(toolsKiManifest)
  expect(await box.project.read('bun.lock')).toBe(toolsKiLock)
  expect(await exists(box, '.husky/_/husky.sh')).toBe(true)
  expect(await binding(box)).toBe('')
})

test('runs only with ki-repo selected and leaves a repository without hooks untouched', async () => {
  const skipped = await setup(toolsKi, '.husky/_')
  await skipped.setupExampleHarness({ name: 'ki-other', rubric: rubric.replace("'ki-repo'", "'ki-other'") })
  await skipped.project.write('.ki.toml', `${declaration}\n[skills.ki-other]\n`)
  expect((await skipped.run('ki repo conform --skill ki-other', { runner: 'default' })).exitCode).toBe(0)
  expect(await exists(skipped, '.githooks')).toBe(false)
  expect(await exists(skipped, '.husky/pre-commit')).toBe(true)

  // No Git call is made, so the sandbox's refusing runner is never reached.
  const plain = await setup({ 'package.json': '{"name":"plain"}\n' })
  expect((await plain.run('ki repo conform')).exitCode).toBe(0)
  expect(await plain.project.read('package.json')).toBe('{"name":"plain"}\n')
})

test('binds a package-less repository and keeps an unrelated hooksPath with a report', async () => {
  const box = await setup({ '.husky/pre-commit': 'make check\n' }, 'tooling/hooks')

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(await box.project.read('.githooks/pre-commit')).toBe(lines(header('pre-commit'), ['make check']))
  expect(result.output).toContain('keep core.hooksPath "tooling/hooks"\n')
  expect(await binding(box)).toBe('tooling/hooks')
  expect(await exists(box, '.husky')).toBe(false)
  expect(await exists(box, '.githooks/commit-msg')).toBe(false)

  const unset = await setup({ '.husky/pre-commit': 'make check\n' })
  expect((await conform(unset)).output).toContain('bind core.hooksPath .githooks\n')
  expect(await binding(unset)).toBe('.githooks')
})

test('a leftover .husky/_ is removed and an existing gate is left as it is', async () => {
  const gate = lines(header('pre-commit'), ['make check'])
  const box = await setup({ '.husky/_/husky.sh': '', '.githooks/pre-commit': gate }, '.husky/_')

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(result.output).toContain('remove .husky/\n')
  expect(result.output).not.toContain('write .githooks/pre-commit')
  expect(await box.project.read('.githooks/pre-commit')).toBe(gate)
  expect(await exists(box, '.husky')).toBe(false)
  expect(await binding(box)).toBe('.githooks')
})

test('prepare: a missing script gains the binding, plain husky becomes it, and an unrelated one stays', async () => {
  const missing = await setup({
    'package.json': '{"name":"a","devDependencies":{"husky":"9"}}',
    '.husky/pre-commit': 'bunx lint-staged\n'
  })
  expect((await conform(missing)).exitCode).toBe(0)
  expect(await missing.project.read('package.json')).toBe(
    '{"name":"a","devDependencies":{},"scripts":{"prepare":"git config core.hooksPath .githooks"}}'
  )

  const plain = await setup({
    'package.json': '{\n  "scripts": { "prepare": "husky install" }\n}\n',
    '.husky/pre-commit': 'bunx lint-staged\n'
  })
  expect((await conform(plain)).exitCode).toBe(0)
  expect(JSON.parse(await plain.project.read('package.json'))).toEqual({
    scripts: { prepare: 'git config core.hooksPath .githooks' }
  })

  const unrelated = await setup({
    'package.json': '{"scripts":{"prepare":"lefthook install"}}',
    '.husky/_/husky.sh': ''
  })
  expect((await conform(unrelated)).exitCode).toBe(0)
  expect(await unrelated.project.read('package.json')).toBe('{"scripts":{"prepare":"lefthook install"}}')

  const scriptless = await setup({ 'package.json': '{"devDependencies":{"husky":"9"}}', '.husky/_/husky.sh': '' })
  expect((await conform(scriptless)).exitCode).toBe(0)
  expect(await scriptless.project.read('package.json')).toBe('{"devDependencies":{}}')

  const hookless = await setup({ 'package.json': '{"name":"b"}', '.husky/_/husky.sh': '' })
  expect((await conform(hookless)).exitCode).toBe(0)
  expect(await hookless.project.read('package.json')).toBe('{"name":"b"}')
  expect(await binding(hookless)).toBe('')
})

test('a committed hook without Husky is left alone, and a repository already converted needs nothing', async () => {
  const box = await setup({ '.githooks/commit-msg': '#!/bin/sh\n# Mentions .husky only in a comment.\nexit 0\n' })
  await box.project.git(['config', 'core.hooksPath', '.githooks'])

  const result = await conform(box)

  expect(result.exitCode).toBe(0)
  expect(result.output).not.toMatch(/^(?:write \.githooks|remove|bind|keep) /m)
})

const refusals: readonly (readonly [string, Readonly<Record<string, string>>, string])[] = [
  ['an unknown .husky file', { '.husky/pre-push': 'make\n' }, '.husky/pre-push has no place in .githooks/'],
  [
    'a Husky hook a committed gate would orphan',
    { '.husky/pre-commit': 'make\n', '.githooks/pre-commit': '#!/bin/sh\nmake\n' },
    '.husky/pre-commit is not called from .githooks/pre-commit'
  ],
  [
    'another .husky reference',
    { '.githooks/pre-commit': '. "$root/.husky/common.sh"\n' },
    '.githooks/pre-commit:1 calls Husky in a form the composer does not recognise'
  ],
  [
    'a delegation to a missing Husky hook',
    { '.githooks/pre-commit': '#!/bin/sh\nsh "$root/.husky/pre-commit" "$@" || exit 1\n' },
    '.githooks/pre-commit:2 calls the missing .husky/pre-commit'
  ],
  ['a Husky hook still calling Husky', { '.husky/pre-commit': 'husky run\n' }, '.husky/pre-commit:1 still calls Husky'],
  [
    'an unrecognised frame line after the content starts',
    {
      '.husky/pre-commit': 'make\n',
      '.githooks/pre-commit': '#!/bin/sh\nset -e\nmissing=""\nsh "$root/.husky/pre-commit" "$@"\n'
    },
    '.githooks/pre-commit:3 is a frame line the composer does not recognise'
  ],
  [
    'a tool loop it cannot read',
    {
      '.husky/pre-commit': 'make\n',
      '.githooks/pre-commit': '#!/bin/sh\nfor tool in a b; do\nfor tool in c; do\nsh "$root/.husky/pre-commit" "$@"\n'
    },
    '.githooks/pre-commit: the frame tests a b in a way it does not recognise'
  ],
  [
    'an unterminated tool loop',
    {
      '.husky/pre-commit': 'make\n',
      '.githooks/pre-commit': '#!/bin/sh\nfor tool in a; do\nsh "$root/.husky/pre-commit" "$@"\n'
    },
    '.githooks/pre-commit: the frame tests a in a way it does not recognise'
  ],
  [
    'a manifest that is not an object',
    { '.husky/pre-commit': 'make\n', 'package.json': '[]' },
    'package.json is not a JSON object'
  ],
  [
    'a manifest that is not JSON',
    { '.husky/pre-commit': 'make\n', 'package.json': '{' },
    'package.json is not a JSON object'
  ],
  [
    'a prepare that is not a string',
    { '.husky/pre-commit': 'make\n', 'package.json': '{"scripts":{"prepare":1}}' },
    'package.json `prepare` is not a string'
  ],
  [
    'Husky elsewhere in prepare',
    { '.husky/pre-commit': 'make\n', 'package.json': '{"scripts":{"prepare":"bun x husky"}}' },
    'package.json `prepare` calls Husky as "bun x husky"'
  ],
  [
    'Husky twice in prepare',
    { '.husky/pre-commit': 'make\n', 'package.json': '{"scripts":{"prepare":"husky && husky"}}' },
    'package.json `prepare` calls Husky as "husky && husky"'
  ],
  [
    'another lockfile',
    { '.husky/pre-commit': 'make\n', 'package.json': '{"devDependencies":{"husky":"9"}}', 'yarn.lock': '' },
    'yarn.lock still locks husky; remove husky with its package manager first'
  ],
  [
    'a lockfile naming husky elsewhere',
    {
      '.husky/pre-commit': 'make\n',
      'package.json': '{"devDependencies":{"husky":"9"}}',
      'bun.lock': '{\n  "packages": {\n    "x": ["x@1", "", { "dependencies": { "husky": "9" } }],\n  }\n}\n'
    },
    'bun.lock names husky beyond its declaration and package'
  ]
]

test.each(refusals)('refuses %s and changes nothing', async (_, files, reason) => {
  const box = await setup(files, '.husky/_')

  const result = await conform(box)

  expect(result).toEqual({
    exitCode: 1,
    output: expect.stringContaining(`hook conversion refused: ${reason}; nothing was changed`)
  })
  expect(result.output).toContain('move the hook content into .githooks/ by hand')
  for (const [path, content] of Object.entries(files)) expect(await box.project.read(path)).toBe(content)
  expect(await binding(box)).toBe('.husky/_')
})

test('refuses a .husky that is not a directory and a hook that is not a regular file', async () => {
  const linked = await setup({ 'elsewhere/pre-commit': 'make\n' })
  await symlink(join(linked.project.path, 'elsewhere'), join(linked.project.path, '.husky'))
  expect((await conform(linked)).output).toContain('hook conversion refused: .husky is not a directory')

  const nested = await setup({})
  await mkdir(join(nested.project.path, '.husky/pre-commit'), { recursive: true })
  expect((await conform(nested)).output).toContain('hook conversion refused: .husky/pre-commit is not a regular file')
  expect(await readdir(join(nested.project.path, '.husky'))).toEqual(['pre-commit'])
})

test('a Husky hook with nothing after its boilerplate composes to the frame alone', async () => {
  const box = await setup({ '.husky/commit-msg': '#!/bin/sh' })

  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('.githooks/commit-msg')).toBe(lines(header('commit-msg')))
  expect(await exists(box, '.githooks/pre-commit')).toBe(false)
  expect(await binding(box)).toBe('')
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
    '{"workspaces":{".":{"ignoreDependencies":["lint-staged"]}},"ignoreDependencies":["lint-staged"]}',
    'knip.json is laid out in a way the conversion cannot edit'
  ],
  [
    'a conflicting husky in knip.ts',
    'knip.ts',
    'const config = {\n  husky: false,\n  ignoreExportsUsedInFile: true\n}\n',
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
