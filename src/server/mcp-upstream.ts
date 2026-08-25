/**
 * Upstream MCP endpoint resolution.
 *
 * The gateway exposes its MCP server list at `GET /api/mcp/servers`. The
 * workspace used to request `GET /api/mcp`, which the gateway answers with
 * `{"detail":"No such API endpoint: /api/mcp"}` — so the capability probe saw
 * a 404 and the MCP screen reported "Not available on this backend" even
 * though MCP was configured and working.
 *
 * `/api/mcp` is still tried as a fallback so gateways that do serve the list
 * there keep working.
 */

/** Current gateway path for listing MCP servers. */
export const MCP_LIST_PATH = '/api/mcp/servers'

/** Legacy path, retained for gateways that still serve the list here. */
export const MCP_LIST_PATH_LEGACY = '/api/mcp'

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/**
 * Fetch the upstream MCP server list, preferring {@link MCP_LIST_PATH}.
 *
 * Falls back to {@link MCP_LIST_PATH_LEGACY} only on 404 — any other status is
 * returned as-is, so a 401 or 500 surfaces to the caller instead of being
 * masked by a second request.
 */
export async function fetchMcpList(fetcher: Fetcher, init?: RequestInit): Promise<Response> {
  const res = await fetcher(MCP_LIST_PATH, init)
  if (res.status !== 404) return res
  return fetcher(MCP_LIST_PATH_LEGACY, init)
}
