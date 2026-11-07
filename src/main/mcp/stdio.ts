/**
 * Stdio MCP shim for agents that speak stdio JSON-RPC
 * (Claude Code/Codex/Cursor when adding the raw app as an MCP server).
 *
 * Usage (launched by an MCP client):
 *   Zeus Vault.exe --mcp-serve
 * or with Electron:
 *   electron . --mcp-serve
 *
 * The shim simply forwards every MCP tool call to the in-process MCP layer.
 * It reuses the same AppContext lifecycle as the app and requires the same
 * unlocked session state: if the vault is not unlocked the tools return a
 * structured error telling the user to unseal the vault in the app.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { AppContext } from '../services/context'
import { McpLayer } from './server'

export async function runMcpStdio(ctx: AppContext | null): Promise<void> {
  const appCtx = ctx ?? new AppContext(process.cwd())
  const opened = appCtx.open()
  if (opened) {
    try {
      appCtx.auth?.restoreSession(appCtx.deviceName())
    } catch {
      /* tools will report the locked state */
    }
  }
  const layer = new McpLayer(appCtx)
  const server = layer.buildServer()
  const transport = new StdioServerTransport()
  if (!opened) {
    process.stderr.write('[zeus-vault-mcp] vault not initialized or unavailable; tools will report errors\n')
  }
  await server.connect(transport)
  process.stderr.write('[zeus-vault-mcp] stdio transport ready\n')
}
