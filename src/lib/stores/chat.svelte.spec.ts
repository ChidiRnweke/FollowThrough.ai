import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type {
	AgentEvent,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunSnapshot,
	ConversationId
} from '$lib/models';
import type {
	AgentRunClientStorage,
	AgentRunTransport,
	StoredAgentRunClientState
} from '$lib/client/agent-runs/contracts';
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
	async decide(): Promise<AgentRunSnapshot> {
		throw new Error('Unexpected decision');
	}
	async cancel(): Promise<AgentRunSnapshot> {
		throw new Error('Unexpected cancellation');
	}
	async retry(
		_runId: AgentRunId,
		_requestId: string
	): Promise<Awaited<ReturnType<AgentRunTransport['retry']>>> {
		throw new Error('Unexpected retry');
	}
	async getSession(
		_conversationId: ConversationId
	): Promise<Awaited<ReturnType<AgentRunTransport['getSession']>>> {
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
		expect(reply.parts.map((part) => part.kind)).toEqual(['reasoning', 'tool', 'text']);
		expect(reply.parts.at(0)).toEqual({
			kind: 'reasoning',
			text: 'Let me search. Broadly first.'
		});
	});

	it('keeps reasoning out of the turn prose', async () => {
		const { reply } = await sendWith([
			{ type: 'reasoning_delta', text: 'Thinking.' },
			{ type: 'text_delta', text: 'The answer.' }
		]);
		expect(entryText(reply)).toBe('The answer.');
	});
});
