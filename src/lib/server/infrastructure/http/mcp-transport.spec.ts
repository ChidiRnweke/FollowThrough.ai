import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { mcpTransport } from './mcp-transport';

const CANONICAL = new URL('https://notes.example');

/** The status the transport answers an `initialize` request with, sent with `headers`. */
async function initializeStatus(headers: Record<string, string>): Promise<number> {
	const server = new McpServer({ name: 'followthrough-test', version: '1.0.0' });
	const transport = mcpTransport(CANONICAL);
	await server.connect(transport);
	try {
		const response = await transport.handleRequest(
			new Request(new URL('/mcp', CANONICAL), {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					...headers
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: {
						protocolVersion: '2025-06-18',
						capabilities: {},
						clientInfo: { name: 'client', version: '1.0.0' }
					}
				})
			})
		);
		return response.status;
	} finally {
		await server.close();
	}
}

describe('the MCP transport', () => {
	it('answers a desktop or CLI client, which sends no Origin', async () => {
		expect(await initializeStatus({ host: 'notes.example' })).toBe(200);
	});

	it('answers a browser on the canonical origin', async () => {
		expect(await initializeStatus({ host: 'notes.example', origin: 'https://notes.example' })).toBe(
			200
		);
	});

	it('refuses a request from a page on another origin', async () => {
		expect(
			await initializeStatus({ host: 'notes.example', origin: 'https://elsewhere.example' })
		).toBe(403);
	});

	it('refuses a request addressed to another host', async () => {
		expect(await initializeStatus({ host: 'rebound.example' })).toBe(403);
	});
});
