import { describe, expect, it } from 'vitest';
import type {
	AgentRunId,
	AgentRunSnapshot,
	Conversation,
	ConversationId,
	MessageId,
	StoredMessage
} from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { WorkspaceRecord, WorkspaceValues } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { syncEtag } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testNow,
	runAgentInputBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import type { AgentRunTransport } from '$lib/client/agent/runs/contracts';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import { ChatStore, entryTools } from './chat.svelte';

const conversationId = '20000000-0000-4000-8000-000000000001' as ConversationId;
const runId = '40000000-0000-4000-8000-000000000001' as AgentRunId;
const conversation: Conversation = {
	id: conversationId,
	userId: testActor().userId,
	kind: 'chat',
	title: 'Saved chat',
	createdAt: testNow,
	updatedAt: testNow
};
const message = (
	role: StoredMessage['role'],
	content: AgentPayloadObject,
	eventCursor?: string
): StoredMessage => ({
	kind: 'readable',
	id: crypto.randomUUID() as MessageId,
	conversationId,
	role,
	content,
	createdAt: testNow,
	...(role === 'user' ? {} : { runId }),
	...(eventCursor ? { eventCursor } : {})
});
const run = (status: WorkspaceValues['agent_runs']['status']): WorkspaceValues['agent_runs'] => ({
	id: runId,
	userId: conversation.userId,
	conversationId,
	status,
	pendingDecisions:
		status === 'awaiting_approval'
			? [
					{
						callId: 'c9',
						toolName: 'update_agent_preferences',
						arguments: { defaultModel: 'example/model' }
					}
				]
			: [],
	createdAt: testNow,
	updatedAt: testNow
});
const setup = async (
	options: {
		conversation?: Partial<Conversation>;
		messages?: readonly StoredMessage[];
		run?: WorkspaceValues['agent_runs'];
		live?: Partial<AgentRunTransport>;
	} = {}
) => {
	const transport = new InMemorySyncTransport<WorkspaceRecord>();
	const cache = new ResourceCache(conversation.userId, {
		repository: new InMemorySyncCache<WorkspaceRecord>(),
		transport
	});
	const writes = new MutationQueue(conversation.userId, {
		repository: new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(),
		transport: new InMemoryNoteWrites(),
		writerLock: new InMemoryAccountWriterLock(),
		resolveBase: async () => {
			throw new Error('No imported drafts');
		},
		received: async (key, value) =>
			cache.accept(key, value.kind === 'found' ? value.snapshot : value)
	});
	const resources = new WorkspaceResources(conversation.userId, {
		cache,
		writes,
		restoreLocalWrites: async () => undefined
	});
	const records: Extract<WorkspaceRecord, { type: 'conversations' | 'messages' | 'agent_runs' }>[] =
		[
			{ type: 'conversations', value: { ...conversation, ...options.conversation } },
			...(options.messages ?? []).map((value) => ({ type: 'messages' as const, value })),
			...(options.run ? [{ type: 'agent_runs' as const, value: options.run }] : [])
		];
	for (const value of records) {
		const key = workspaceResourceKey({ type: value.type, id: [value.value.id] });
		const snapshot = { etag: syncEtag(1n), value };
		transport.records.set(key, snapshot);
		await cache.accept(key, snapshot);
	}
	resources.setOnline(false);
	const store = new ChatStore(
		crypto.randomUUID(),
		capabilityDependencies<AgentRunTransport>(options.live ?? {})
	);
	store.conversationId = conversationId;
	return { store, resources, cache, transport };
};

const parked = () =>
	message(
		'tool',
		{
			callId: 'c9',
			name: 'update_agent_preferences',
			input: { defaultModel: 'example/model' },
			status: 'approval_required'
		},
		'1'
	);

describe('shared cached chat history', () => {
	it('renders cached history without requesting a live run while offline', async () => {
		const reads: AgentRunId[] = [];
		const { store, resources } = await setup({
			messages: [message('user', { type: 'text', text: 'Saved question' })],
			run: run('completed'),
			live: {
				get: async (id) => {
					reads.push(id);
					throw new Error('Offline');
				}
			}
		});
		await store.hydrate(resources);
		expect({ parts: store.entries[0].parts, reads }).toEqual({
			parts: [{ kind: 'text', text: 'Saved question' }],
			reads: []
		});
	});
	it('retains pasted images after the text of the saved turn', async () => {
		const { store, resources } = await setup({
			messages: [
				message('user', {
					type: 'text',
					text: 'What is this?',
					images: [
						{
							id: 'img-1',
							mediaType: 'image/png',
							dataUrl: 'data:image/png;base64,AAA',
							name: 'shot.png'
						}
					]
				})
			]
		});
		await store.hydrate(resources);
		expect(store.entries[0].parts).toEqual([
			{ kind: 'text', text: 'What is this?' },
			{ kind: 'image', id: 'img-1', dataUrl: 'data:image/png;base64,AAA', name: 'shot.png' }
		]);
	});
	it('retains readable text when a saved image field is malformed', async () => {
		const { store, resources } = await setup({
			messages: [message('user', { type: 'text', text: 'Hi', images: 'invalid' })]
		});
		await store.hydrate(resources);
		expect(store.entries[0].parts).toEqual([{ kind: 'text', text: 'Hi' }]);
	});
	it('shows an unreadable persisted message instead of dropping it', async () => {
		const { store, resources } = await setup({
			messages: [{ ...message('tool', {}), kind: 'unreadable', reason: 'Invalid stored payload' }]
		});
		await store.hydrate(resources);
		expect(store.entries[0].parts.map((part) => part.kind)).toEqual(['unreadable']);
	});
	it('does not invent a tool for an unknown journalled tool name', async () => {
		const { store, resources } = await setup({
			messages: [
				message('tool', { callId: 'c1', name: 'not_a_tool', input: {}, status: 'succeeded' }, '1')
			]
		});
		await store.hydrate(resources);
		expect({
			parts: store.entries[0].parts.map((part) => part.kind),
			tools: entryTools(store.entries[0])
		}).toEqual({ parts: ['unreadable'], tools: [] });
	});
	it('keeps reasoning, tools, and text in event order within one assistant turn', async () => {
		const { store, resources } = await setup({
			messages: [
				message('tool', { callId: 'c1', name: 'get_note', input: {}, status: 'succeeded' }, '2'),
				message('assistant', { type: 'reasoning', text: 'Think first' }, '1'),
				message('assistant', { type: 'text', text: 'Done' }, '3')
			]
		});
		await store.hydrate(resources);
		expect(store.entries.map((entry) => entry.parts.map((part) => part.kind))).toEqual([
			['reasoning', 'tool', 'text']
		]);
	});
	it('retains a parked approval as pending while offline', async () => {
		const { store, resources } = await setup({
			messages: [parked()],
			run: run('awaiting_approval')
		});
		await store.hydrate(resources);
		expect({ status: entryTools(store.entries[0])[0].status, enabled: store.canExecute }).toEqual({
			status: 'approval_required',
			enabled: false
		});
	});
	it('does not turn an offline approval attempt into a failed tool', async () => {
		const { store, resources } = await setup({
			messages: [parked()],
			run: run('awaiting_approval')
		});
		await store.hydrate(resources);
		const entry = store.entries[0];
		await store.decideAll(entry, entryTools(entry), 'approve');
		expect(entryTools(entry)[0].status).toBe('approval_required');
	});
	it('marks a parked call abandoned when the saved run is no longer waiting', async () => {
		const { store, resources } = await setup({
			messages: [parked()],
			run: { ...run('failed'), failure: 'Run stopped' }
		});
		await store.hydrate(resources);
		expect(entryTools(store.entries[0])[0].status).toBe('failed');
	});
	it('keeps execution disabled until the reconnected run has been checked', async () => {
		const pending = Promise.withResolvers<AgentRunSnapshot>();
		const { store, resources } = await setup({
			messages: [parked()],
			run: run('awaiting_approval'),
			live: { get: async () => pending.promise }
		});
		await store.hydrate(resources);
		resources.setOnline(true);
		const refreshing = store.revalidate();
		const enabledBefore = store.canExecute;
		const snapshot: AgentRunSnapshot = {
			run: {
				...run('completed'),
				kind: 'agent',
				model: 'example/model',
				executionMode: 'approval_required',
				requestId: crypto.randomUUID(),
				inputSnapshot: runAgentInputBuilder({ conversationId }),
				contextSnapshot: { contextNotes: [], skills: { items: [] } }
			},
			pendingDecisions: [],
			latestCursor: '2'
		};
		pending.resolve(snapshot);
		await refreshing;
		expect({
			before: enabledBefore,
			after: store.canExecute,
			tool: entryTools(store.entries[0])[0].status
		}).toEqual({
			before: false,
			after: true,
			tool: 'failed'
		});
	});
	it('does not install a delayed history read after clearing the chat', async () => {
		const { store, resources } = await setup({
			messages: [message('user', { type: 'text', text: 'Old chat' })]
		});
		const loading = store.hydrate(resources);
		store.clear();
		await loading;
		expect({ id: store.conversationId, entries: store.entries }).toEqual({
			id: undefined,
			entries: []
		});
	});
	it('rechecks a previously opened conversation after a server deletion', async () => {
		const { store, resources, cache } = await setup();
		await store.hydrate(resources);
		await cache.accept(workspaceResourceKey({ type: 'conversations', id: [conversationId] }), {
			kind: 'deleted',
			etag: syncEtag(2n)
		});
		await store.hydrate(resources);
		expect(store.historyError).toBe('This chat is not available on this device');
	});
	it('orders neighboring large event cursors exactly', async () => {
		const { store, resources } = await setup({
			messages: [
				message('assistant', { type: 'text', text: 'Second' }, '9007199254740993'),
				message('assistant', { type: 'text', text: 'First' }, '9007199254740992')
			]
		});
		await store.hydrate(resources);
		expect(store.entries[0].parts).toEqual([
			{ kind: 'text', text: 'First' },
			{ kind: 'text', text: 'Second' }
		]);
	});
	it('reports an unavailable conversation and stops loading', async () => {
		const { store, resources, cache } = await setup();
		await cache.accept(workspaceResourceKey({ type: 'conversations', id: [conversationId] }), {
			kind: 'deleted',
			etag: syncEtag(2n)
		});
		await store.hydrate(resources);
		expect({ loading: store.loading, failure: store.historyError }).toEqual({
			loading: false,
			failure: 'This chat is not available on this device'
		});
	});
});

describe('saved conversation choices', () => {
	it.each([
		['modelOverride', 'example/chat'],
		['visionModelOverride', 'example/vision'],
		['executionModeOverride', 'auto_accept']
	] as const)('restores %s from the shared record', async (field, value) => {
		const { store, resources } = await setup({ conversation: { [field]: value } });
		await store.hydrate(resources);
		expect(store[field]).toBe(value);
	});
	it('clears previous overrides when switching to a conversation with no overrides', async () => {
		const { store, resources } = await setup();
		store.conversationId = '20000000-0000-4000-8000-000000000002' as ConversationId;
		store.modelOverride = 'old/model';
		store.visionModelOverride = 'old/vision';
		store.executionModeOverride = 'auto_accept';
		await store.switchToConversation(conversationId, resources);
		expect({
			model: store.modelOverride,
			vision: store.visionModelOverride,
			mode: store.executionModeOverride
		}).toEqual({ model: null, vision: null, mode: 'approval_required' });
	});
});
