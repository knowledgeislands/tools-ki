export const MCP_SOURCE_RECEIPT_SCHEMA = 'ki/mcp-source/v1' as const
export const MCP_SOURCE_REPORT_SCHEMA = 'ki/mcp-sources/v1' as const
export const MCP_ENTRY_POINT = 'dist/mcp-server/index.js' as const

export type McpSourceAuth = 'public' | 'github-cli'

export interface McpSourceReceipt {
  readonly schema: typeof MCP_SOURCE_RECEIPT_SCHEMA
  readonly repository: string
  readonly tag: string
  readonly commit: string
  readonly packageVersion: string
  readonly entryPoint: typeof MCP_ENTRY_POINT
  readonly installedAt: string
  readonly auth: McpSourceAuth
}

export interface McpSourceInstallation extends McpSourceReceipt {
  readonly active: boolean
}

export interface McpSourceReport {
  readonly schema: typeof MCP_SOURCE_REPORT_SCHEMA
  readonly installations: readonly McpSourceInstallation[]
}
