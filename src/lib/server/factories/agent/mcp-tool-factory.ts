import type { McpToolSession } from '$lib/models/agent-tool-protocol';
import { createMcpServer, type McpToolConnection } from './tools/mcp';

export type { McpToolConnection } from './tools/mcp';
export type McpSurfaceFactory = (session: McpToolSession) => McpToolConnection;
export const createMcpToolSurface: McpSurfaceFactory = createMcpServer;
