import { Command } from 'commander'
import { grammarError } from '../core/errors.ts'
import type { CommandContext } from '../core/output.ts'
import { installationMode, resolveKiPaths } from '../core/paths.ts'
import { KI_VERSION } from '../version.ts'

const commandNames = ['acquire', 'completions', 'doctor', 'help', 'paths', 'version']

const formatPaths = (): string => {
  const paths = resolveKiPaths()
  return `data: ${paths.data}\nconfig: ${paths.config}\ncache: ${paths.cache}\nstate: ${paths.state}\n`
}

const pathsResult = (): string => JSON.stringify({ version: 1, ...resolveKiPaths() })

export const createBaselineCommands = (context: CommandContext): Command[] => {
  const completions = new Command('completions')
    .description('print Bash or Zsh completion source')
    .argument('<shell>', 'shell name: bash or zsh')
    .action((shell: string) => {
      if (shell === 'bash') {
        context.stdout.write(`complete -W "${[...commandNames, '--help', '--version'].join(' ')}" ki\n`)
        return
      }
      if (shell === 'zsh') {
        context.stdout.write(`#compdef ki\n_arguments "1: :(( ${commandNames.join(' ')} ))"\n`.replace('( ', '(').replace(' ))', '))'))
        return
      }
      throw grammarError('completions shell must be bash or zsh')
    })

  const paths = new Command('paths')
    .description('print the resolved XDG paths used by KI')
    .option('--json', 'emit a versioned JSON result')
    .action((options: { json?: boolean }) => context.stdout.write(options.json ? `${pathsResult()}\n` : formatPaths()))

  const doctor = new Command('doctor')
    .description('report CLI installation mode and resolved XDG paths')
    .option('--json', 'emit a versioned JSON result')
    .action(async (options: { json?: boolean }) => {
      const installation = await installationMode(context.executable)
      if (options.json) {
        context.stdout.write(`${JSON.stringify({ version: 1, ki_version: KI_VERSION, installation, ...resolveKiPaths() })}\n`)
        return
      }
      context.stdout.write(`ki version: ${KI_VERSION}\ninstallation: ${installation}\n${formatPaths()}`)
    })

  const version = new Command('version').description('print the CLI version').action(() => context.stdout.write(`ki ${KI_VERSION}\n`))

  return [completions, doctor, paths, version]
}
