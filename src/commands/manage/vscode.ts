import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { reconcileVscode, type VscodeManagePort } from '../../core/manage/vscode.ts'

const vscodePort = (context: KiContext): VscodeManagePort => ({
  environment: context.environment,
  stateDirectory: context.paths.state,
  runner: context.runner,
  stdout: context.stdout,
  stderr: context.stderr
})

export const createVscodeCommand = (context: KiContext): Command => {
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
}
