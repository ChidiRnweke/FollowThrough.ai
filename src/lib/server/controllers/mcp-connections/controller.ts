import type { McpConnection, McpConnectionId } from '$lib/models/identity';
import type { McpConnectionLedger } from '$lib/server/services/identity/mcp-grants';

/**
 * Approving a client is deliberately absent. A connection acts as the user, so granting one
 * stays a consent step in the browser rather than something an agent session — including one
 * already authenticated through MCP — can do for itself.
 */
export interface McpConnectionsController {
	/** List the MCP clients the user authorized and has not revoked. */
	list(): Promise<readonly McpConnection[]>;
	/** Permanently revoke a connection; its access and refresh tokens stop working from that point. */
	revoke(id: McpConnectionId): Promise<Pick<McpConnection, 'id' | 'clientName'>>;
}

export interface McpConnectionsDependencies {
	connections: McpConnectionLedger;
}

export class McpConnections implements McpConnectionsController {
	constructor(private readonly dependencies: McpConnectionsDependencies) {}

	list(): Promise<readonly McpConnection[]> {
		return this.dependencies.connections.list();
	}

	revoke(id: McpConnectionId): Promise<Pick<McpConnection, 'id' | 'clientName'>> {
		return this.dependencies.connections.revoke(id);
	}
}
