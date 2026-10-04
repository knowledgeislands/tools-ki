import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import {
  installMcpSource,
  listMcpSources,
  rollbackMcpSource,
  uninstallMcpSource,
  updateMcpSource
} from '../../core/mcp/index.ts'

interface AuthOptions {
  readonly auth?: 'github-cli'
}

const authOption = (): Option =>
  new Option('--auth <mode>', 'authenticate private GitHub access').choices(['github-cli'])

const installationLine = (verb: string, installation: Awaited<ReturnType<typeof installMcpSource>>): string =>
  `MCP source ${verb}: ${installation.repository} ${installation.packageVersion} (${installation.commit})\n`

export const createMcpCommand = (context: KiContext): Command => {
  const command = new Command('mcp').description('install and manage versioned MCP source releases')

  command.addCommand(
    new Command('install')
      .description('install and activate one MCP source release')
      .summary('install an MCP source release')
      .argument('<repository>', 'lower-case GitHub owner/repository')
      .argument('[version]', 'exact Semantic Version without v prefix')
      .addOption(authOption())
      .action(async (repository: string, version: string | undefined, options: AuthOptions) => {
        const installed = await installMcpSource({
          dataDirectory: context.paths.data,
          repository,
          ...(version === undefined ? {} : { version }),
          ...(options.auth === undefined ? {} : { auth: options.auth }),
          fetcher: context.fetcher,
          runner: context.runner,
          environment: context.environment,
          now: context.now
        })
        context.stdout.write(installationLine('installed', installed))
      })
  )

  command.addCommand(
    new Command('update')
      .description('build and activate a newer MCP source release')
      .summary('update an MCP source release')
      .argument('<repository>', 'lower-case GitHub owner/repository')
      .argument('[version]', 'exact Semantic Version without v prefix')
      .addOption(authOption())
      .action(async (repository: string, version: string | undefined, options: AuthOptions) => {
        const installed = await updateMcpSource({
          dataDirectory: context.paths.data,
          repository,
          ...(version === undefined ? {} : { version }),
          ...(options.auth === undefined ? {} : { auth: options.auth }),
          fetcher: context.fetcher,
          runner: context.runner,
          environment: context.environment,
          now: context.now
        })
        context.stdout.write(installationLine('updated', installed))
      })
  )

  command.addCommand(
    new Command('rollback')
      .description('activate one retained MCP source version')
      .summary('activate a retained MCP version')
      .argument('<repository>', 'lower-case GitHub owner/repository')
      .argument('<version>', 'installed Semantic Version without v prefix')
      .action(async (repository: string, version: string) => {
        const installed = await rollbackMcpSource(context.paths.data, repository, version)
        context.stdout.write(installationLine('rolled back', installed))
      })
  )

  command.addCommand(
    new Command('uninstall')
      .description('remove one MCP source and every retained version')
      .summary('remove an MCP source')
      .argument('<repository>', 'lower-case GitHub owner/repository')
      .action(async (repository: string) => {
        await uninstallMcpSource(context.paths.data, repository)
        context.stdout.write(`MCP source uninstalled: ${repository}\n`)
      })
  )

  command.addCommand(
    new Command('list')
      .description('list installed MCP source versions')
      .summary('list installed MCP source versions')
      .argument('[repository]', 'lower-case GitHub owner/repository')
      .option('--format <text|json>', 'output format', 'text')
      .action(async (repository: string | undefined, options: { readonly format: string }) => {
        if (options.format !== 'text' && options.format !== 'json')
          throw grammarError('mcp list --format must be text or json')
        const report = await listMcpSources(context.paths.data, repository)
        if (options.format === 'json') {
          context.stdout.write(`${JSON.stringify(report, undefined, 2)}\n`)
          return
        }
        context.stdout.write(
          report.installations
            .map(
              (installation) =>
                `${installation.active ? '*' : '-'} ${installation.repository} ${installation.packageVersion} ${installation.commit}`
            )
            .join('\n') + (report.installations.length ? '\n' : '')
        )
      })
  )

  return command
}
