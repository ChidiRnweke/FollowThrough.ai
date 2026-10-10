import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
const noteMarkdown = new NodeNoteMarkdown();
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { z } from 'zod';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { AgentFilesController } from '$lib/server/controllers/agent-files/controller';
import { toolFailureSchema } from '$lib/models/agent/tool-failure';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';

import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
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
		tokens: testTokenizer,
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

const failureResult = z.object({
	isError: z.literal(true),
	content: z.tuple([z.object({ type: z.literal('text'), text: z.string() })])
});
const readFailure = (result: Awaited<ReturnType<Client['callTool']>>) => {
	const payload = failureResult.parse(result);
	return toolFailureSchema.parse(JSON.parse(payload.content[0].text));
};

describe('MCP lifecycle failure contract', () => {
	it.each([[], Array.from({ length: 6 }, () => ({ oldText: 'Monday', newText: 'Tuesday' }))])(
		'returns application validation as a structured tool error for edits %j',
		async (edits) => {
			const note = noteBuilder({ ...noteMarkdown.read('Launch Monday.') });
			const fixture = reviewedNoteFixture(note);
			const client = await connect('full', { factory: fixture.factory });
			const failure = readFailure(
				await client.callTool({ name: 'edit_note', arguments: { noteId: note.id, edits } })
			);
			expect({
				code: failure.code,
				recovery: failure.recovery,
				body: fixture.content.notes[0].plainText
			}).toEqual({
				code: 'VALIDATION',
				recovery: 'Read the failure, correct the arguments it names, and call the tool again.',
				body: 'Launch Monday.'
			});
		}
	);
	it('allows a corrected call after validation fails', async () => {
		const note = noteBuilder({ ...noteMarkdown.read('Launch Monday.') });
		const fixture = reviewedNoteFixture(note);
		const client = await connect('full', { factory: fixture.factory });
		await client.callTool({ name: 'edit_note', arguments: { noteId: note.id, edits: [] } });
		await client.callTool({
			name: 'edit_note',
			arguments: { noteId: note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] }
		});
		expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
	});
	it('marks returned preparation failures as tool errors', async () => {
		const note = noteBuilder({ ...noteMarkdown.read('Launch Monday.') });
		const client = await connect('full', { factory: reviewedNoteFixture(note).factory });
		const failure = readFailure(
			await client.callTool({
				name: 'edit_note',
				arguments: { noteId: note.id, edits: [{ oldText: 'Friday', newText: 'Tuesday' }] }
			})
		);
		expect(failure).toMatchObject({
			kind: 'failure',
			code: 'NOTE_REVIEW_FAILED',
			details: { problems: [expect.stringContaining('not found')] }
		});
	});
	it('keeps internal preparation details out of the MCP response', async () => {
		const note = noteBuilder();
		const fixture = reviewedNoteFixture(note, {
			read: () => {
				throw new TypeError('private converter implementation');
			},
			write: noteMarkdown.write
		});
		const client = await connect('full', { factory: fixture.factory });
		const failure = readFailure(
			await client.callTool({
				name: 'save_note',
				arguments: { noteId: note.id, markdown: '# Release' }
			})
		);
		expect(failure).toEqual({
			kind: 'failure',
			code: 'INTERNAL_ERROR',
			message:
				'The application failed while handling this call. The fault is ours, not your arguments.',
			recovery:
				'Do not retry this call. Changing the arguments will not change the result. Tell the user what you were trying to do, then continue with the rest of the task or stop.',
			details: {}
		});
	});
	it('uses the common envelope for discovery validation', async () => {
		const client = await connect('full');
		expect(
			readFailure(await client.callTool({ name: 'search_tools', arguments: { query: 42 } })).code
		).toBe('VALIDATION');
	});
	it('uses the common envelope for an unavailable tool', async () => {
		const client = await connect('read');
		expect(readFailure(await client.callTool({ name: 'save_note', arguments: {} })).code).toBe(
			'TOOL_NOT_AVAILABLE'
		);
	});
});

it('returns an execution-time domain refusal as a canonical MCP failure', async () => {
	const note = noteBuilder();
	const fixture = reviewedNoteFixture(note);
	fixture.content.notes = [];
	const client = await connect('full', { factory: fixture.factory });
	expect(
		readFailure(
			await client.callTool({
				name: 'save_note',
				arguments: { noteId: note.id, markdown: 'Changed body' }
			})
		).code
	).toBe('NOT_FOUND');
});

it('preserves the exact file recovery call in an MCP error result', async () => {
	const nextActions = [
		{ reason: 'List available files', tool: 'ls' as const, arguments: { path: '/' } }
	];
	const files = capabilityDependencies<AgentFilesController>({
		ls: async () => ({
			kind: 'error',
			code: 'path_not_found',
			message: 'Path does not exist.',
			requestedPath: '/missing',
			nextActions
		})
	});
	const factory = capabilityDependencies<ControllerFactory>({ agentFiles: () => files });
	const client = await connect('full', { factory });
	expect(
		readFailure(await client.callTool({ name: 'ls', arguments: { path: '/missing' } }))
	).toEqual({
		kind: 'failure',
		code: 'path_not_found',
		message: 'Path does not exist.',
		recovery: 'Follow the exact nextActions below.',
		details: { requestedPath: '/missing', nextActions }
	});
});

it('accepts omitted MCP arguments when every application field is optional', async () => {
	const files = capabilityDependencies<AgentFilesController>({
		ls: async () => ({ kind: 'listed', path: '/', entries: [] })
	});
	const factory = capabilityDependencies<ControllerFactory>({ agentFiles: () => files });
	const client = await connect('full', { factory });
	const result = await client.callTool({ name: 'ls' });
	expect(result).toMatchObject({
		content: [{ type: 'text', text: JSON.stringify({ kind: 'listed', path: '/', entries: [] }) }]
	});
});

it('retains the fifteen-tool discovery ceiling for MCP', async () => {
	const client = await connect('full');
	expect(
		readFailure(
			await client.callTool({ name: 'search_tools', arguments: { query: 'notes', limit: 16 } })
		).code
	).toBe('VALIDATION');
});
