import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { extractWWWAuthenticateParams } from '@modelcontextprotocol/sdk/client/auth.js';
import {
	StreamableHTTPClientTransport,
	StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ExternalServiceError } from '$lib/errors';
import { agentPayloadObjectResultSchema } from '$lib/models/agent/payload';
import type {
	AuthorizationChallenge,
	ConnectorToolHints,
	ConnectorToolSchema,
	ListedConnectorTool,
	ServerAccess
} from '$lib/models/connectors';
import { compileJsonSchema } from '$lib/server/infrastructure/json-schema/compile';
import type { FetchLike } from '$lib/server/infrastructure/network/outbound';

export type ToolListing =
	| { readonly kind: 'listed'; readonly tools: readonly ListedConnectorTool[] }
	| { readonly kind: 'unauthorized'; readonly challenge: AuthorizationChallenge };

export interface ConnectorToolListing {
	/** Initializes a session, lists every tool across pages and closes the session. */
	listTools(serverUrl: string, access: ServerAccess): Promise<ToolListing>;
}

/**
 * The MCP client side of connectors. It owns the server as a provider, so it
 * parses what servers return into connector models (ADR 0037). Every operation
 * opens its own session and closes it, so no session outlives the operation
 * (ADR 0025). The client advertises no capabilities: no sampling, elicitation
 * or roots.
 */
export class ConnectorServers implements ConnectorToolListing {
	constructor(private readonly fetch: FetchLike) {}

	async listTools(serverUrl: string, access: ServerAccess): Promise<ToolListing> {
		// Every response passes through this operation's fetch, so a 401 below has been seen here.
		let challenge: AuthorizationChallenge | undefined;
		const client = new Client({ name: 'followthrough', title: 'FollowThrough', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
			fetch: async (url, init) => {
				const response = await this.fetch(url, init);
				if (response.status === 401) {
					const params = extractWWWAuthenticateParams(response);
					challenge = {
						resourceMetadataUrl: params.resourceMetadataUrl?.href,
						scope: params.scope
					};
				}
				return response;
			},
			requestInit:
				access.kind === 'bearer' ? { headers: { Authorization: `Bearer ${access.token}` } } : {}
		});
		try {
			await client.connect(transport);
			return { kind: 'listed', tools: await this.everyTool(client, serverUrl) };
		} catch (error) {
			if (error instanceof StreamableHTTPError && error.code === 401 && challenge)
				return { kind: 'unauthorized', challenge };
			if (error instanceof ExternalServiceError) throw error;
			throw new ExternalServiceError(
				`${new URL(serverUrl).host} did not answer as an MCP server.`,
				{
					cause: error instanceof Error ? error.message : String(error)
				}
			);
		} finally {
			await client.close();
		}
	}

	private async everyTool(client: Client, serverUrl: string): Promise<ListedConnectorTool[]> {
		const tools: ListedConnectorTool[] = [];
		const cursors = new Set<string>();
		let cursor: string | undefined;
		do {
			const page = await client.listTools(cursor === undefined ? {} : { cursor });
			tools.push(...page.tools.map(listed));
			cursor = page.nextCursor;
			if (cursor !== undefined && cursors.has(cursor))
				throw new ExternalServiceError(`${new URL(serverUrl).host} repeated a tool list page.`);
			if (cursor !== undefined) cursors.add(cursor);
		} while (cursor !== undefined);
		return tools;
	}
}

/** The specification's defaults for an annotation a server leaves out. */
const hintsOf = (tool: Tool): ConnectorToolHints => ({
	readOnly: tool.annotations?.readOnlyHint ?? false,
	destructive: tool.annotations?.destructiveHint ?? true,
	idempotent: tool.annotations?.idempotentHint ?? false,
	openWorld: tool.annotations?.openWorldHint ?? true
});

const schemaOf = (tool: Tool): ConnectorToolSchema => {
	const parsed = agentPayloadObjectResultSchema.parse(tool.inputSchema);
	if (parsed.kind === 'corrupt')
		return { kind: 'unusable', reason: `The input schema is not JSON: ${parsed.message}` };
	if (parsed.value.type !== 'object')
		return { kind: 'unusable', reason: 'The input schema does not describe an object.' };
	const compilation = compileJsonSchema(parsed.value);
	if (compilation.kind === 'failure') return { kind: 'unusable', reason: compilation.reason };
	return { kind: 'usable', inputSchema: parsed.value };
};

const listed = (tool: Tool): ListedConnectorTool => {
	const content = {
		serverName: tool.name,
		title: tool.title ?? tool.annotations?.title ?? tool.name,
		description: tool.description ?? '',
		schema: schemaOf(tool),
		hints: hintsOf(tool)
	};
	return {
		...content,
		checksum: createHash('sha256').update(JSON.stringify(content)).digest('hex')
	};
};
