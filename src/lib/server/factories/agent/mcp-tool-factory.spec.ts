import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { ApiTokenScope } from '$lib/models/identity';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';
import { createMcpToolSurface } from '$lib/server/factories/agent/mcp-tool-factory';

const connect = async (
	scope: ApiTokenScope,
	options: {
		factory?: ControllerFactory;
		retriever?: InMemoryToolRetriever;
		disabled?: readonly string[];
	} = {}
): Promise<Client> => {
	const server = createMcpToolSurface({
		controllers: options.factory ?? ({} as ControllerFactory),
		actor: testActor(),
		scope,
		provenanceId: testProvenanceId(),
		toolRetriever: options.retriever ?? new InMemoryToolRetriever(),
		toolAccess: { isEnabled: (name) => !(options.disabled ?? []).includes(name) }
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
			'edit_note',
			'get_note',
			'get_workspace_context',
			'grep',
			'list_project_memory',
			'list_todos',
			'list_user_memory',
			'load_skill',
			'ls',
			'propose_memory_change',
			'save_note',
			'search',
			'search_note',
			'search_tools',
			'sed'
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

	it('does not promote a mutation on a read-scoped token', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_todo'];
		const client = await connect('read', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'create a todo' }
		});
		expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([]);
	});

	it('refuses to revoke an access token on a read-scoped token', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['revoke_api_token'];
		const client = await connect('read', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'revoke token' }
		});
		expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([]);
	});

	it('offers no tool that creates an access token', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_api_token'];
		const client = await connect('full', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'create token' }
		});
		expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([]);
	});

	it('has no free-form wrapper tool', async () => {
		const client = await connect('full');
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name)).not.toContain('use_tool');
	});

	it('rejects a payload that does not match the target schema', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_todo'];
		const client = await connect('full', { retriever });
		await client.callTool({ name: 'search_tools', arguments: { query: 'create a todo' } });
		const result = await client.callTool({
			name: 'create_todo',
			arguments: {}
		});
		expect(result.isError).toBe(true);
	});

	it('returns discoverable tools from search_tools with their schemas', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_todo'];
		const client = await connect('full', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'add a task' }
		});
		const matches = JSON.parse((result.content as { text: string }[])[0].text);
		expect(Object.keys(matches[0]).sort()).toEqual([
			'callable_directly',
			'classification',
			'description',
			'input_schema',
			'name'
		]);
	});

	it('publishes the compact save_note schema through tool search', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['save_note'];
		const client = await connect('full', { retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'replace note content' }
		});
		const matches = JSON.parse((result.content as { text: string }[])[0].text);
		expect(matches[0].input_schema.required.sort()).toEqual(['markdown', 'noteId']);
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

describe('Deselected tools over MCP', () => {
	it('stops advertising a deselected first-class tool', async () => {
		const client = await connect('full', { disabled: ['get_note'] });
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name)).not.toContain('get_note');
	});

	it('does not promote a deselected tool', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['archive_project'];
		const client = await connect('full', { disabled: ['archive_project'], retriever });
		const result = await client.callTool({
			name: 'search_tools',
			arguments: { query: 'archive project' }
		});
		expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([]);
	});
});
