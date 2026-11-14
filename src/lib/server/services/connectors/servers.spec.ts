import { describe, expect, it } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ExternalServiceError } from '$lib/errors';
import { FakeConnectorNetwork } from '$lib/testing/connectors/fakes/fake-connector-network';
import { FakeConnectorServer } from '$lib/testing/connectors/fakes/fake-connector-server';
import { ConnectorServers } from './servers';

const tool = (name: string, extra: Partial<Tool> = {}): Tool => ({
	name,
	description: `${name} description`,
	inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
	...extra
});

const serve = (server: FakeConnectorServer) => {
	const network = new FakeConnectorNetwork().route(server.origin, server.handle);
	return { network, servers: new ConnectorServers(network.fetch) };
};

describe('ConnectorServers.listTools', () => {
	it('lists every tool across pages with the specification defaults for missing hints', async () => {
		const server = new FakeConnectorServer('https://mcp.example.com', {
			path: '/mcp',
			authorization: { kind: 'none' },
			pageSize: 1,
			tools: [
				tool('list_issues', { title: 'List issues', annotations: { readOnlyHint: true } }),
				tool('create_issue')
			]
		});
		const listing = await serve(server).servers.listTools(server.url, { kind: 'anonymous' });
		expect(
			listing.kind === 'listed'
				? listing.tools.map(({ serverName, title, hints, schema }) => ({
						serverName,
						title,
						hints,
						schema: schema.kind
					}))
				: listing
		).toEqual([
			{
				serverName: 'list_issues',
				title: 'List issues',
				hints: { readOnly: true, destructive: true, idempotent: false, openWorld: true },
				schema: 'usable'
			},
			{
				serverName: 'create_issue',
				title: 'create_issue',
				hints: { readOnly: false, destructive: true, idempotent: false, openWorld: true },
				schema: 'usable'
			}
		]);
	});

	it('keeps a tool whose schema cannot be used, with the reason', async () => {
		const server = new FakeConnectorServer('https://mcp.example.com', {
			path: '/mcp',
			authorization: { kind: 'none' },
			tools: [
				tool('broken', {
					inputSchema: { type: 'object', properties: { q: { type: 'strng' as 'string' } } }
				})
			]
		});
		const listing = await serve(server).servers.listTools(server.url, { kind: 'anonymous' });
		expect(listing.kind === 'listed' ? listing.tools[0]!.schema.kind : listing.kind).toBe(
			'unusable'
		);
	});

	it('answers a refused request with the challenge, and sends the token it was given', async () => {
		const server = new FakeConnectorServer('https://mcp.example.com', {
			path: '/mcp',
			authorization: {
				kind: 'bearer',
				accepts: (token) => token === 'good-token',
				authorizationServer: 'https://auth.example.com',
				scopes: ['read', 'write']
			},
			tools: [tool('list_issues')]
		});
		const { network, servers } = serve(server);
		const refused = await servers.listTools(server.url, { kind: 'anonymous' });
		const accepted = await servers.listTools(server.url, { kind: 'bearer', token: 'good-token' });
		expect({
			refused,
			accepted: accepted.kind,
			sentToken: network.sent.some((request) => request.authorization === 'Bearer good-token')
		}).toEqual({
			refused: {
				kind: 'unauthorized',
				challenge: {
					resourceMetadataUrl: 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
					scope: 'read write'
				}
			},
			accepted: 'listed',
			sentToken: true
		});
	});

	it('reports an unreachable server as an external failure', async () => {
		const servers = new ConnectorServers(new FakeConnectorNetwork().fetch);
		await expect(
			servers.listTools('https://gone.example.com/mcp', { kind: 'anonymous' })
		).rejects.toBeInstanceOf(ExternalServiceError);
	});
});
