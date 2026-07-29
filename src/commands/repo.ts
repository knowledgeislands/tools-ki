import type { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { createRepositoryOperations } from '../core/repository-operations.ts'

/** Commander binding for the repository-operation domain. */
export const createRepoCommand = (context: KiContext): Command => createRepositoryOperations(context)
