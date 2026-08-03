import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type {
	AgentEvent,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunSnapshot,
	ConversationId
} from '$lib/models/agent';
import type {
	AgentRunClientStorage,
	AgentRunTransport,
	StoredAgentRunClientState
} from '$lib/client/agent/runs/contracts';
import { ChatStore, entryText } from './chat.svelte';

const runId = '10000000-0000-4000-8000-000000000001' as AgentRunId;
const conversationId = '20000000-0000-4000-8000-000000000001' as ConversationId;

class MemoryStorage implements AgentRunClientStorage {
	state: StoredAgentRunClientState = { cursor: '0', attempt: 0 };
	load() {
		return this.state;
	}
	save(state: StoredAgentRunClientState) {
		this.state = state;
	}
	clear() {
		this.state = { cursor: '0', attempt: 0 };
	}
}

class FakeAgentRunTransport implements AgentRunTransport {
	constructor(private readonly events: readonly AgentEvent[]) {}
	async submit() {
		return { runId, conversationId, status: 'queued' as const, latestCursor: '0' };
	}
	async get(): Promise<AgentRunSnapshot> {
		throw new Error('Unexpected reconciliation');
	}
	async decideMany(
		input: Parameters<AgentRunTransport['decideMany']>[0]
	): Promise<AgentRunSnapshot> {
		void input;
		throw new Error('Unexpected decision');
	}
	async cancel(): Promise<AgentRunSnapshot> {
		throw new Error('Unexpected cancellation');
	}
	async retry(
		runId: AgentRunId,
		requestId: string
	): Promise<Awaited<ReturnType<AgentRunTransport['retry']>>> {
		void runId;
		void requestId;
		throw new Error('Unexpected retry');
	}
	async getSession(
		conversationId: ConversationId
	): Promise<Awaited<ReturnType<AgentRunTransport['getSession']>>> {
		void conversationId;
		throw new Error('Unexpected hydration');
	}
	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		queueMicrotask(() => {
			input.onOpen();
			const events: AgentEvent[] = [
				{ type: 'run_started', runId, attempt: 1 },
				...this.events,
				{ type: 'completed', runId, conversationId }
			];
			events.forEach((event, index) =>
				input.onEvent({
					cursor: String(index + 1),
					runId,
					attempt: 1,
					event,
					createdAt: new Date()
				} satisfies AgentRunEventRecord)
			);
		});
		return { close() {} };
	}
}

class DecidingTransport extends FakeAgentRunTransport {
	constructor(
		events: readonly AgentEvent[],
		private readonly record: (input: Parameters<AgentRunTransport['decideMany']>[0]) => void
	) {
		super(events);
	}
	override async decideMany(input: Parameters<AgentRunTransport['decideMany']>[0]) {
		this.record(input);
		return {
			run: { id: runId, status: 'queued', conversationId },
			pendingDecisions: []
		} as unknown as AgentRunSnapshot;
	}
}

/**
 * Streams without ever settling, so a test can stop the turn mid-flight and
 * then deliver the server's `cancelled` event by hand.
 */
class StoppableTransport implements AgentRunTransport {
	cancelled: AgentRunId[] = [];
	private emit?: (event: AgentEvent, cursor: number) => void;
	async submit() {
		return { runId, conversationId, status: 'queued' as const, latestCursor: '0' };
	}
	async get(): Promise<AgentRunSnapshot> {
		throw new Error('Unexpected reconciliation');
	}
	async decideMany(): Promise<AgentRunSnapshot> {
		throw new Error('Unexpected decision');
	}
	async cancel(id: AgentRunId): Promise<AgentRunSnapshot> {
		this.cancelled.push(id);
		return {
			run: { id: runId, status: 'cancelling', conversationId },
			pendingDecisions: []
		} as unknown as AgentRunSnapshot;
	}
	async retry(): Promise<Awaited<ReturnType<AgentRunTransport['retry']>>> {
		throw new Error('Unexpected retry');
	}
	async getSession(): Promise<Awaited<ReturnType<AgentRunTransport['getSession']>>> {
		throw new Error('Unexpected hydration');
	}
	deliver(event: AgentEvent): void {
		this.emit?.(event, 9);
	}
	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		this.emit = (event, cursor) =>
			input.onEvent({
				cursor: String(cursor),
				runId,
				attempt: 1,
				event,
				createdAt: new Date()
			} satisfies AgentRunEventRecord);
		queueMicrotask(() => {
			input.onOpen();
			this.emit!({ type: 'run_started', runId, attempt: 1 }, 1);
			this.emit!({ type: 'text_delta', text: 'Working on it' }, 2);
		});
		return { close() {} };
	}
}

class FailingTransport extends FakeAgentRunTransport {
	override async decideMany(): Promise<AgentRunSnapshot> {
		throw new Error('offline');
	}
}

const streamedEvents: AgentEvent[] = [
	{ type: 'text_delta', text: 'Let me check. ' },
	{ type: 'tool_started', callId: 'call-1', name: 'find_references', arguments: { query: 'x' } },
	{ type: 'tool_completed', callId: 'call-1', name: 'find_references', output: { count: 2 } },
	{ type: 'text_delta', text: 'Found two.' }
];

const sendWith = async (events: AgentEvent[]) => {
	const store = new ChatStore(new FakeAgentRunTransport(events), new MemoryStorage());
	await store.send({ prompt: 'look this up' });
	await Promise.resolve();
	return { store, reply: store.entries.at(-1)! };
};

describe('chat event projection', () => {
	it('keeps tool calls inline between text segments', async () => {
		const { reply } = await sendWith(streamedEvents);
		expect(reply.parts.map((part) => part.kind)).toEqual(['text', 'tool', 'text']);
	});

	it('merges a tool completion into its inline start part', async () => {
		const { reply } = await sendWith(streamedEvents);
		const tool = reply.parts.find((part) => part.kind === 'tool');
		expect(tool?.kind === 'tool' && tool.tool.status).toBe('succeeded');
	});

	it('keeps text after a tool call in a separate segment', async () => {
		const { reply } = await sendWith(streamedEvents);
		expect(reply.parts.at(-1)).toEqual({ kind: 'text', text: 'Found two.' });
	});

	it('records the optimistic prompt once', async () => {
		const { store } = await sendWith(streamedEvents);
		expect(store.entries.at(0)?.parts).toEqual([{ kind: 'text', text: 'look this up' }]);
	});

	it('notifies reactive observers when the streamed reply completes', async () => {
		const store = new ChatStore(new FakeAgentRunTransport(streamedEvents), new MemoryStorage());
		const seen: (string | undefined)[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(store.entries.at(-1)?.status);
			});
		});
		flushSync();
		await store.send({ prompt: 'look this up' });
		await Promise.resolve();
		flushSync();
		stop();
		expect(seen.at(-1)).toBe('completed');
	});

	it('a later attempt replaces abandoned partial output', async () => {
		const { reply } = await sendWith([
			{ type: 'text_delta', text: 'Old' },
			{ type: 'run_started', runId, attempt: 2 },
			{ type: 'text_delta', text: 'New' }
		]);
		expect(reply.parts).toEqual([{ kind: 'text', text: 'New' }]);
	});

	it('keeps reasoning inline in the order it streams', async () => {
		const { reply } = await sendWith([
			{ type: 'reasoning_delta', text: 'Let me search. ' },
			{ type: 'reasoning_delta', text: 'Broadly first.' },
			{ type: 'tool_started', callId: 'call-1', name: 'search', arguments: { query: '*' } },
			{ type: 'tool_completed', callId: 'call-1', name: 'search', output: { count: 1 } },
			{ type: 'text_delta', text: 'Found one.' }
		]);
		expect({
			kinds: reply.parts.map((part) => part.kind),
			reasoning: reply.parts.at(0)
		}).toEqual({
			kinds: ['reasoning', 'tool', 'text'],
			reasoning: {
				kind: 'reasoning',
				text: 'Let me search. Broadly first.'
			}
		});
	});

	it('answers every parked call in one decision', async () => {
		const decided: { callIds: readonly string[]; decision: string }[] = [];
		const store = new ChatStore(
			new DecidingTransport(
				[
					{
						type: 'approval_required',
						runId,
						callId: 'call-a',
						name: 'create_todo',
						arguments: {}
					},
					{
						type: 'approval_required',
						runId,
						callId: 'call-b',
						name: 'archive_note',
						arguments: {}
					}
				],
				(input) => decided.push({ callIds: input.callIds, decision: input.decision })
			),
			new MemoryStorage()
		);
		await store.send({ prompt: 'do both' });
		await Promise.resolve();
		const reply = store.entries.at(-1)!;
		const tools = reply.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);
		await store.decideAll(reply, tools, 'approve');
		expect({ decided, statuses: tools.map((tool) => tool.status) }).toEqual({
			decided: [{ callIds: ['call-a', 'call-b'], decision: 'approve' }],
			statuses: ['running', 'running']
		});
	});

	it('leaves a failed decision visible on every card it covered', async () => {
		const store = new ChatStore(
			new FailingTransport([
				{ type: 'approval_required', runId, callId: 'call-a', name: 'create_todo', arguments: {} },
				{ type: 'approval_required', runId, callId: 'call-b', name: 'archive_note', arguments: {} }
			]),
			new MemoryStorage()
		);
		await store.send({ prompt: 'do both' });
		await Promise.resolve();
		const reply = store.entries.at(-1)!;
		const tools = reply.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);
		await store.decideAll(reply, tools, 'approve');
		expect(tools.map((tool) => tool.status)).toEqual(['failed', 'failed']);
	});

	it('keeps reasoning out of the turn prose', async () => {
		const { reply } = await sendWith([
			{ type: 'reasoning_delta', text: 'Thinking.' },
			{ type: 'text_delta', text: 'The answer.' }
		]);
		expect(entryText(reply)).toBe('The answer.');
	});
});

describe('stopping a streaming turn', () => {
	const streaming = async () => {
		const transport = new StoppableTransport();
		const store = new ChatStore(transport, new MemoryStorage());
		await store.send({ prompt: 'take your time' });
		await Promise.resolve();
		return { transport, store, reply: store.entries.at(-1)! };
	};

	it('asks the server to cancel the active run', async () => {
		const { transport, store } = await streaming();
		await store.stop();
		expect(transport.cancelled).toEqual([runId]);
	});

	it('shows the turn as cancelling while the server settles it', async () => {
		const { store, reply } = await streaming();
		await store.stop();
		expect(reply.status).toBe('cancelling');
	});

	it('settles the turn when the cancelled event arrives', async () => {
		const { transport, store, reply } = await streaming();
		await store.stop();
		transport.deliver({ type: 'cancelled', runId, message: 'Generation stopped' });
		expect(reply.status).toBe('cancelled');
	});

	it('keeps the partial output the turn had already streamed', async () => {
		const { transport, store, reply } = await streaming();
		await store.stop();
		transport.deliver({ type: 'cancelled', runId, message: 'Generation stopped' });
		expect(entryText(reply)).toBe('Working on it');
	});
});
