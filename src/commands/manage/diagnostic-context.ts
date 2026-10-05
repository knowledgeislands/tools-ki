import type { KiContext } from '../../context.ts'
import { KI_VERSION } from '../../version.ts'
import type { TreeEntry } from '../presentation/index.ts'

export const diagnosticContext = (context: KiContext, configuration: string): TreeEntry[] => [
  { label: 'Tool: ki' },
  { label: `Version: ${KI_VERSION}` },
  { label: `Installation: ${context.installationProvenance}` },
  {
    label: `Platform: ${({ darwin: 'macos', win32: 'windows' } as Record<string, string>)[context.platform] ?? context.platform}`
  },
  {
    label: `Architecture: ${({ x64: 'x86_64', AMD64: 'x86_64' } as Record<string, string>)[context.architecture] ?? context.architecture}`
  },
  { label: `Runtime: ${context.runtime}` },
  { label: `Configuration: ${configuration}` }
]
