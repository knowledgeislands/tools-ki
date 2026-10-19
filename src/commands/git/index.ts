import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { checkMessage } from '../../core/git/message.ts'

const createCheckMessageCommand = (context: KiContext): Command =>
  new Command('check-message')
    .description('check a commit message file against the ki-git message rules')
    .argument('<file>', 'commit message file, as Git passes it to commit-msg')
    .action(async (file: string) => {
      const path = resolve(context.workingDirectory, file)
      const text = await readFile(path, 'utf8').catch(() => {
        throw new KiError(`cannot read the commit message file ${path}`, 1)
      })
      const failure = checkMessage(text)
      if (failure) throw new KiError(`${failure.rule}: ${failure.reason}`, 1, failure.remedy)
    })

export const createGitCommand = (context: KiContext): Command =>
  new Command('git')
    .description('check Git artefacts against ki-git rules')
    .addCommand(createCheckMessageCommand(context))
