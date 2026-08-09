import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const execute = promisify(execFile)

const commandPaths = [
  'acquire',
  'acquire chatgpt',
  'acquire chatgpt import',
  'agora',
  'agora list',
  'agora open',
  'agora show',
  'bootstrap',
  'dev',
  'dev local',
  'dev local off',
  'dev local on',
  'dev local set',
  'dev skill',
  'dev skill rubric',
  'harness',
  'harness info',
  'harness install',
  'harness list',
  'harness reinstall',
  'harness uninstall',
  'manage',
  'manage cleanup',
  'manage completion',
  'manage diag',
  'manage docs',
  'manage doctor',
  'manage list',
  'manage missing',
  'manage outdated',
  'manage repair',
  'manage search',
  'manage update',
  'registry',
  'registry add',
  'registry list',
  'repo',
  'repo audit',
  'repo conform',
  'repo educate',
  'repo init',
  'repo repair',
  'repo roadmap',
  'repo roadmap demote',
  'repo roadmap list',
  'repo roadmap promote',
  'repo roadmap prune',
  'repo skill',
  'repo skill add',
  'repo skill remove',
  'repo upgrade',
  'skill',
  'skill add',
  'skill remove',
  'trade',
  'trade abandon',
  'trade list',
  'trade observe',
  'trade prepare',
  'trade prune',
  'trade receive',
  'trade release',
  'trade routes',
  'trade routes add',
  'trade routes check',
  'trade routes list',
  'trade routes remove',
  'trade show',
  'trade submit'
] as const

describe('[ki manage completion]', () => {
  test('renders zsh and bash completion scripts', async () => {
    const box = await sandbox()
    const zsh = await box.run('ki manage completion zsh')
    const bash = await box.run('ki manage completion bash')

    expect(zsh.output).toContain('#compdef ki')
    expect(zsh.output).toContain("zstyle ':completion:*:ki-commands' verbose yes")
    expect(zsh.output).toContain("'repo roadmap')")
    expect(zsh.output).toContain("'repo skill')")
    expect(zsh.output).toContain("'trade routes')")
    expect(zsh.output).toContain('--estate:list route declarations across the registered repository estate')
    expect(zsh.output).toContain('--incomplete:show only routes that are not active')
    expect(zsh.output).toContain("'acquire chatgpt')")
    expect(zsh.output).toContain("'dev local')")
    expect(zsh.output).toContain('import:import a local capture into an immutable Knowledge Export Package')
    expect(zsh.output).toContain('-h:display help for command')
    expect(zsh.output).toContain("_describe -t ki-commands 'command or option' candidates")
    expect(zsh.output).toContain('trade:submit and inspect typed cross-repository work and knowledge trades')
    expect(bash.output).toContain('_ki_value_strategy()')
    expect(bash.output).toContain("'repo roadmap')")
    expect(bash.output).toContain("'trade routes')")
    expect(bash.output).toContain(
      "'trade routes list') printf '%s\\n' '-V --version -h --help --estate --incomplete --html'"
    )
    expect(bash.output).toContain("'acquire chatgpt')")
    expect(bash.output).toContain("'dev local')")
    expect(bash.output).toContain("'repo roadmap list:--horizon')")
    expect(bash.output).toContain("'acquire chatgpt import:--output')")
    expect(bash.output).toContain("'-V --version -h --help'")
    expect(bash.output).toContain('compgen -f')
    expect(bash.output).toContain('complete -F _ki ki')
    for (const path of commandPaths) {
      expect(bash.output).toContain(`'${path}')`)
      expect(zsh.output).toContain(`'${path}')`)
    }
    for (const output of [bash.output, zsh.output]) {
      expect(output).toContain("'repo:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'repo roadmap:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'registry:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'acquire chatgpt import:0') printf '%s\\n' 'path'")
      expect(output).toContain("'manage docs:0') printf '%s\\n' 'overview site manual roadmap'")
      expect(output).toContain("'trade prepare:--observation') printf '%s\\n' 'unattended receipt decision completion'")
      expect(output).toContain("'trade prepare:--title') printf '%s\\n' ''")
      expect(output).toContain("'repo init:--repository') printf '%s\\n' ''")
    }
  })

  test('rejects an unsupported shell and requires a shell argument', async () => {
    const box = await sandbox()
    const invalidCompletion = await box.run('ki manage completion fish')
    const missingCompletionShell = await box.run('ki manage completion')

    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completion shell must be bash or zsh\n' })
    expect(missingCompletionShell.exitCode).toBe(2)
  })

  test('emits loadable scripts whose Bash completion reaches repo roadmap', async () => {
    const box = await sandbox()
    const bash = await box.run('ki manage completion bash')
    const zsh = await box.run('ki manage completion zsh')
    await box.root.write('completion.bash', bash.output)
    await box.root.write('completion.zsh', zsh.output)

    await expect(execute('bash', ['-n', 'completion.bash'], { cwd: box.root.path })).resolves.toBeDefined()
    await expect(execute('zsh', ['-n', 'completion.zsh'], { cwd: box.root.path })).resolves.toBeDefined()
    await expect(
      execute('zsh', ['-fc', 'autoload -Uz compinit; compinit -D -i; source completion.zsh'], { cwd: box.root.path })
    ).resolves.toBeDefined()
    const zshCandidates = await execute(
      'zsh',
      ['-fc', 'autoload -Uz compinit; compinit -D -i; source completion.zsh; _ki_candidates ""'],
      {
        cwd: box.root.path
      }
    )
    expect(zshCandidates.stdout.split('\n')).toEqual(
      expect.arrayContaining([
        'bootstrap:configure detected agents and install KI core user skills',
        'repo:run operations for one or more KI repositories'
      ])
    )
    expect(zshCandidates.stdout).not.toContain("'bootstrap:")

    const completion = await execute(
      'bash',
      [
        '-c',
        `source completion.bash; COMP_WORDS=(ki repo roadmap ""); COMP_CWORD=3; _ki; printf "%s\\n" "\${COMPREPLY[@]}"`
      ],
      {
        cwd: box.root.path
      }
    )
    const candidates = completion.stdout.trim().split('\n')
    expect(candidates).toEqual(expect.arrayContaining(['list', 'prune', 'promote', 'demote']))
    expect(candidates).not.toContain('plan')
  })

  test('rejects retired root and plural completion command names', async () => {
    const box = await sandbox()
    const root = await box.run('ki completion zsh')
    const plural = await box.run('ki completions bash')

    expect(root.exitCode).toBe(2)
    expect(plural.exitCode).toBe(2)
  })
})
