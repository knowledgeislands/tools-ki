import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createEstateConvergeCommand } from './converge.ts'

export const createEstateCommand = (context: KiContext): Command =>
  new Command('estate')
    .description('reshape this machine’s checkouts to a tracked estate targets manifest')
    .addCommand(createEstateConvergeCommand(context))
