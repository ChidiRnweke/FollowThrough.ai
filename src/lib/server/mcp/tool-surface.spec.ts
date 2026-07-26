import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ControllerFactory } from '$lib/factories';
import type { ApiTokenScope } from '$lib/models';
import { InMemoryToolRetriever } from '$lib/testing/fakes/in-memory-agent';
import { testActor, testProvenanceId } from '$lib/testing/fixtures/domain-builders';
import { createMcpToolSurface } from './tool-surface';

const connect = async (
	scope: ApiTokenScope,
	options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
): Promise<Client> => {
	const server = createMcpToolSurface({
		controllers: options.factory ?? ({} as ControllerFactory),
		actor: testActor(),
		scope,
		provenanceId: testProvenanceId(),
		toolRetriever: options.retriever ?? new InMemoryToolRetriever()
	});
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'test', version: '1.0.0' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	return client;
};

const toolNames = async (scope: ApiTokenScope): Promise<string[]> => {
	const { tools } = await (await connect(scope)).listTools();
	return tools.map((tool) => tool.name).sort();
};

describe('MCP tool surface', () => {
	it('advertises the first-class tools plus the two meta-tools', async () => {
		expect(await toolNames('full')).toEqual([
			'get_note',
			'get_workspace_context',
			'list_project_memory',
			'list_todos',
			'list_user_memory',
			'load_skill',
			'propose_memory_change',
			'search',
			'search_tools',
			'use_tool'
		]);
	});

	it('withholds the proposal tool from a read-scoped token', async () => {
		expect(await toolNames('read')).not.toContain('propose_memory_change');
	});

	it('marks read tools as read-only for the host', async () => {
		const { tools } = await (await connect('read')).listTools();
		const search = tools.find((tool) => tool.name === 'search');
		expect(search?.annotations?.readOnlyHint).toBe(true);
	});

	it('publishes an input schema the host can validate against', async () => {
		const { tools } = await (await connect('full')).listTools();
		const note = tools.find((tool) => tool.name === 'get_note');
		expect(note?.inputSchema.required).toEqual(['noteId']);
	});

	it('refuses a mutation through use_tool on a read-scoped token', async () => {
		const client = await connect('read');
		const result = await client.callTool({
			name: 'use_tool',
			arguments: { name: 'create_todo', payload: { title: 'Write it down' } }
		});
		expect(result.isError).toBe(true);
	});

	it('suggests a near miss when use_tool is given an unknown name', async () => {
		const client = await connect('full');
		const result = await client.callTool({
			name: 'use_tool',
			arguments: { name: 'create_todos' }
		});
		expect(JSON.stringify(result.content)).toContain('create_todo');
	});

	it('rejects a payload that does not match the target schema', async () => {
		const client = await connect('full');
		const result = await client.callTool({
			name: 'use_tool',
			arguments: { name: 'create_todo', payload: {} }
		});
		expect(JSON.stringify(result.content)).toContain('Invalid payload');
	});

	it('returns discoverable tools from search_tools with their schemas', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_todo'];
		const client = await connect('full', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'add a task' }
		});
		expect(JSON.stringify(result.content)).toContain('input_schema');
	});

	it('never offers a mutation to search_tools on a read-scoped token', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_todo'];
		const client = await connect('read', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'add a task' }
		});
		expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([]);
	});
});
