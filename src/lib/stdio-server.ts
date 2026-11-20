import type { McpServer, StdioServer } from "./schemas";

export function isStdioServer(server: McpServer): server is StdioServer {
  return "command" in server;
}

export function requireStdioServer(serverName: string, server: McpServer | undefined): StdioServer {
  if (server === undefined) {
    throw new Error(`No MCP server configured: ${serverName}`);
  }
  if (!isStdioServer(server)) {
    throw new Error(`Server '${serverName}' is not a stdio MCP server`);
  }
  return server;
}