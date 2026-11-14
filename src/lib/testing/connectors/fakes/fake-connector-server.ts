// chisel-ignore agent:tool-boundary -- stands in for a third party's MCP server in tests; it is not a FollowThrough tool surface.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolResult,
	type Tool
} from '@modelcontextprotocol/sdk/types.js';

export type ServerAuthorization =
	| { readonly kind: 'none' }
	| {
			readonly kind: 'bearer';
			readonly accepts: (token: string) => boolean;
			/** Published in protected resource metadata; absent for a server that only takes tokens. */
			readonly authorizationServer: string | undefined;
			readonly scopes: readonly string[];
	  };

export interface FakeConnectorServerOptions {
	readonly path: string;
	readonly authorization: ServerAuthorization;
	readonly tools: readonly Tool[];
	/** Tools per `tools/list` page; every tool on one page when absent. */
	readonly pageSize?: number;
	readonly call?: (name: string) => CallToolResult;
}

/**
 * A remote MCP server, run with the SDK's own stateless server transport so the
 * client under test speaks real Streamable HTTP to it.
 */
export class FakeConnectorServer {
	tools: readonly Tool[];

	constructor(
		readonly origin: string,
		private readonly options: FakeConnectorServerOptions
	) {
		this.tools = options.tools;
	}

	get url(): string {
		return new URL(this.options.path, this.origin).href;
	}

	private get resourceMetadataUrl(): string {
		return new URL(`/.well-known/oauth-protected-resource${this.options.path}`, this.origin).href;
	}

	readonly handle = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const authorization = this.options.authorization;
		if (url.href === this.resourceMetadataUrl && authorization.kind === 'bearer')
			return authorization.authorizationServer === undefined
				? new Response('not found', { status: 404 })
				: Response.json({
						resource: this.url,
						authorization_servers: [authorization.authorizationServer],
						scopes_supported: authorization.scopes
					});
		if (url.pathname !== new URL(this.url).pathname)
			return new Response('not found', { status: 404 });
		if (authorization.kind === 'bearer') {
			const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
			if (!token || !authorization.accepts(token))
				return new Response('unauthorized', {
					status: 401,
					headers: {
						'www-authenticate': `Bearer resource_metadata="${this.resourceMetadataUrl}"${
							authorization.scopes.length ? `, scope="${authorization.scopes.join(' ')}"` : ''
						}`
					}
				});
		}
		const server = new Server(
			{ name: 'fake-connector', version: '1.0.0' },
			{ capabilities: { tools: {} } }
		);
		server.setRequestHandler(ListToolsRequestSchema, async (list) => {
			const size = this.options.pageSize ?? this.tools.length;
			const start = Number(list.params?.cursor ?? 0);
			const end = start + size;
			return {
				tools: [...this.tools.slice(start, end)],
				...(end < this.tools.length ? { nextCursor: String(end) } : {})
			};
		});
		server.setRequestHandler(CallToolRequestSchema, async (call) =>
			this.options.call
				? this.options.call(call.params.name)
				: { content: [{ type: 'text', text: `${call.params.name} ran` }] }
		);
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true
		});
		await server.connect(transport);
		return transport.handleRequest(request);
	};
}
