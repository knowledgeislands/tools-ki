import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { createVscodeSourceStore, reconcileVscode, type VscodeManagePort } from '../../core/manage/vscode.ts'

const vscodePort = (context: KiContext): VscodeManagePort => ({
  environment: context.environment,
  homeDirectory: context.homeDirectory,
  stateDirectory: context.paths.state,
  runner: context.runner,
  stdout: context.stdout,
  stderr: context.stderr
})

export const createVscodeCommand = (context: KiContext): Command => {
  const source = new Command('source').description('manage opt-in repository source stores').addCommand(
    new Command('create')
      .description('create and associate one opt-in OneDrive source store')
      .argument('<repository>', 'registered repository basename or absolute path')
      .option('--write', 'create the store and publish source-state changes')
      .action(async (repository: string, options: { write?: boolean }) => {
        const result = await createVscodeSourceStore(vscodePort(context), repository, Boolean(options.write))
        if (result.changed && !options.write) throw new KiExit(1)
      })
  )

  return new Command('vscode')
    .description('reconcile local VS Code projections with the KI registry')
    .addCommand(
      new Command('check').description('report source-state drift without writing').action(async () => {
        const result = await reconcileVscode(vscodePort(context), false)
        if (result.changed) throw new KiExit(1)
      })
    )
    .addCommand(
      new Command('sync')
        .description('preview or publish VS Code source-state reconciliation')
        .option('--write', 'publish source-state changes')
        .action(async (options: { write?: boolean }) => {
          const result = await reconcileVscode(vscodePort(context), Boolean(options.write))
          if (result.changed && !options.write) throw new KiExit(1)
        })
    )
    .addCommand(source)
}
