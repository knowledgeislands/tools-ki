import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const execute = promisify(execFile)

const commandPaths = [
  'acquire',
  'acquire list',
  'acquire import',
  'acquire status',
  'acquire reconcile',
  'acquire reset',
  'agora',
  'agora audit',
  'agora inspect',
  'agora reference',
  'agora reference list',
  'agora reference remove',
  'agora reference set',
  'agora list',
  'agora open',
  'agora roots',
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
  'harness missing',
  'harness outdated',
  'harness reinstall',
  'harness search',
  'harness uninstall',
  'cleanup',
  'completion',
  'diag',
  'docs',
  'doctor',
  'inventory',
  'mcp',
  'mcp install',
  'mcp list',
  'mcp rollback',
  'mcp uninstall',
  'mcp update',
  'repair',
  'update',
  'vscode',
  'vscode check',
  'vscode sync',
  'registry',
  'registry add',
  'registry list',
  'registry remove',
  'repo',
  'repo audit',
  'repo batch',
  'repo batch close',
  'repo batch prepare',
  'repo batch run',
  'repo batch validate',
  'repo conform',
  'repo educate',
  'repo init',
  'repo open',
  'repo repair',
  'repo roadmap',
  'repo roadmap demote',
  'repo roadmap list',
  'repo roadmap migrate',
  'repo roadmap stats',
  'repo roadmap promote',
  'repo roadmap prune',
  'repo store',
  'repo store bind',
  'repo store create',
  'repo store list',
  'repo store scan',
  'repo store unbind',
  'repo skill',
  'repo skill add',
  'repo skill remove',
  'repo upgrade',
  'skill',
  'skill add',
  'skill remove',
  'repo trade',
  'repo trade abandon',
  'repo trade list',
  'repo trade observe',
  'repo trade prepare',
  'repo trade policy',
  'repo trade policy check',
  'repo trade policy compare',
  'repo trade policy show',
  'repo trade prune',
  'repo trade receive',
  'repo trade release',
  'repo trade routes',
  'repo trade routes check',
  'repo trade routes list',
  'repo trade standing',
  'repo trade standing capture',
  'repo trade standing check',
  'repo trade standing list',
  'repo trade show',
  'repo trade submit'
] as const

describe('[ki completion]', () => {
  test('renders zsh and bash completion scripts', async () => {
    const box = await sandbox()
    const zsh = await box.run('ki completion zsh')
    const bash = await box.run('ki completion bash')

    expect(zsh.output).toContain('#compdef ki')
    expect(zsh.output).toContain("zstyle ':completion:*:ki-commands' verbose yes")
    expect(zsh.output).toContain("'repo roadmap')")
    expect(zsh.output).toContain("'repo skill')")
    expect(zsh.output).toContain("'repo trade routes')")
    expect(zsh.output).toContain("'repo trade standing')")
    expect(zsh.output).toContain("'repo trade policy')")
    expect(zsh.output).not.toContain("'repo trade subtypes')")
    expect(zsh.output).toContain('--estate:select every repository in the registered estate')
    expect(zsh.output).toContain('--incomplete:show only routes that are not active')
    expect(zsh.output).toContain('--format:render estate route evidence as text or versioned JSON')
    expect(zsh.output).toContain("'agora open:--target') printf '%s\\n' 'zed vscode delta'")
    expect(bash.output).toContain("'agora open:--target') printf '%s\\n' 'zed vscode delta'")
    expect(zsh.output).toContain("'repo open:--target') printf '%s\\n' 'zed vscode delta'")
    expect(bash.output).toContain("'repo open:--target') printf '%s\\n' 'zed vscode delta'")
    expect(zsh.output).toContain("'agora inspect:--target') printf '%s\\n' 'zed vscode'")
    expect(bash.output).toContain("'agora inspect:--target') printf '%s\\n' 'zed vscode'")
    expect(zsh.output).toContain("'agora inspect') printf '%s\\n' '--target --workspace'")
    expect(bash.output).toContain("'agora inspect:--workspace')")
    expect(zsh.output).toContain("'acquire list')")
    expect(zsh.output).toContain("'acquire import')")
    expect(zsh.output).toContain("'acquire reset')")
    expect(zsh.output).toContain("'dev local')")
    expect(zsh.output).toContain('import:acquire source material into repository Harbour')
    expect(zsh.output).toContain('-h:display help for command')
    expect(zsh.output).toContain("_describe -t ki-commands 'command or option' candidates")
    expect(zsh.output).toContain('trade:submit and inspect typed cross-repository work and knowledge trades')
    expect(bash.output).toContain('_ki_value_strategy()')
    expect(bash.output).toContain("'repo roadmap')")
    expect(bash.output).toContain("'repo trade routes')")
    expect(bash.output).toContain(
      "'repo trade routes list') printf '%s\\n' '-V --version -h --help --repo --agora --estate --incomplete --format'"
    )
    expect(bash.output).toContain("'repo trade standing capture:--capture')")
    expect(bash.output).toContain("'repo trade policy compare:--baseline')")
    expect(bash.output).toContain("'acquire list')")
    expect(bash.output).toContain("'repo batch') printf '%s\\n' 'close prepare run validate'")
    expect(bash.output).toContain("'repo batch prepare:--item')")
    expect(bash.output).toContain("'repo batch prepare:--repo')")
    expect(bash.output).toContain("'dev local')")
    expect(bash.output).toContain("'repo roadmap list:--horizon')")
    expect(bash.output).toContain("'repo roadmap list:--status')")
    expect(bash.output.split('\n').find((line) => line.includes("'repo roadmap list:--links')"))).toContain(
      'compact all'
    )
    expect(zsh.output).toContain('--aggregate:render one selected-set roadmap inventory')
    expect(zsh.output).toContain('stats:report roadmap age and inactivity')
    expect(bash.output).toContain("'repo roadmap stats:--format')")
    expect(bash.output).toContain("'mcp install:--auth') printf '%s\\n' 'github-cli'")
    expect(bash.output).toContain("'mcp list:--format') printf '%s\\n' 'text json'")
    expect(bash.output).toContain("'acquire import:--output')")
    expect(bash.output).toContain("'-V --version -h --help'")
    expect(bash.output).toContain('compgen -f')
    expect(bash.output).toContain('complete -F _ki ki')
    for (const path of commandPaths) {
      expect(bash.output).toContain(`'${path}')`)
      expect(zsh.output).toContain(`'${path}')`)
    }
    for (const output of [bash.output, zsh.output]) {
      expect(output).toContain("'acquire import:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'repo:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'repo roadmap:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'registry:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'registry remove:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'registry list:--format') printf '%s\\n' 'text json'")
      expect(output).toContain("'repo roadmap list:--format') printf '%s\\n' 'text json'")
      expect(output).toContain("'repo store list:--format') printf '%s\\n' 'text json'")
      expect(output).toContain("'acquire import:--capture') printf '%s\\n' 'path'")
      expect(output).toContain("'docs:0') printf '%s\\n' 'overview site manual roadmap'")
      expect(output).toContain("'mcp update:--auth') printf '%s\\n' 'github-cli'")
      expect(output).toContain(
        "'repo trade prepare:--observation') printf '%s\\n' 'unattended receipt decision completion'"
      )
      expect(output).toContain("'repo trade prepare:--title') printf '%s\\n' ''")
      expect(output).toContain("'repo trade standing capture:--capture')")
      expect(output).toContain("'repo init:--repository') printf '%s\\n' ''")
    }
  })

  test('rejects an unsupported shell and requires a shell argument', async () => {
    const box = await sandbox()
    const invalidCompletion = await box.run('ki completion fish')
    const missingCompletionShell = await box.run('ki completion')

    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completion shell must be bash or zsh\n' })
    expect(missingCompletionShell.exitCode).toBe(2)
  })

  test('emits loadable scripts whose Bash completion reaches repo roadmap', async () => {
    const box = await sandbox()
    const bash = await box.run('ki completion bash')
    const zsh = await box.run('ki completion zsh')
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

    const statusCompletion = await execute(
      'bash',
      [
        '-c',
        `source completion.bash; COMP_WORDS=(ki repo roadmap list --status ""); COMP_CWORD=5; _ki; printf "%s\\n" "\${COMPREPLY[@]}"`
      ],
      { cwd: box.root.path }
    )
    expect(statusCompletion.stdout.trim().split('\n')).toEqual([
      'triage',
      'draft',
      'ready',
      'in-progress',
      'awaiting-review',
      'done',
      'cancelled'
    ])

    const tradeStatusCompletion = await execute(
      'bash',
      [
        '-c',
        `source completion.bash; COMP_WORDS=(ki repo trade list --status ""); COMP_CWORD=5; _ki; printf "%s\\n" "\${COMPREPLY[@]}"`
      ],
      { cwd: box.root.path }
    )
    expect(tradeStatusCompletion.stdout.trim().split('\n')).toEqual([
      'unconsidered',
      'in_progress',
      'parked',
      'clarify',
      'applied',
      'adopted',
      'retained',
      'declined',
      'superseded'
    ])

    const horizonCompletion = await execute(
      'bash',
      [
        '-c',
        `source completion.bash; COMP_WORDS=(ki repo roadmap list --horizon ""); COMP_CWORD=5; _ki; printf "%s\\n" "\${COMPREPLY[@]}"`
      ],
      { cwd: box.root.path }
    )
    expect(horizonCompletion.stdout.trim().split('\n')).toEqual(['now', 'next', 'soon', 'future', 'hold'])
  })

  test('rejects retired manage grouping and plural completion command names', async () => {
    const box = await sandbox()
    const root = await box.run('ki manage completion zsh')
    const plural = await box.run('ki completions bash')

    expect(root.exitCode).toBe(2)
    expect(plural.exitCode).toBe(2)
  })
})
