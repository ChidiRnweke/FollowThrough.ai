import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type {
	AgentEvent,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunSnapshot,
	ConversationId,
	SubmitAgentRunInput
} from '$lib/models/agent';
import type {
	AgentRunClientStorage,
	AgentRunTransport,
	StoredAgentRunClientState
} from '$lib/client/agent/runs/contracts';
import type { NoteId } from '$lib/models/notes';
import { ChatStore, entryText, type ContextChip, type SelectionChip } from './chat.svelte';

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
	async submit(input: SubmitAgentRunInput) {
		void input;
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

/**
 * Rejects the cancel request itself, then answers reconciliation with a
 * snapshot — or, with none given, rejects that too (fully offline).
 */
class UnconfirmedCancelTransport extends StoppableTransport {
	constructor(private readonly snapshot?: AgentRunSnapshot) {
		super();
	}
	override async cancel(): Promise<AgentRunSnapshot> {
		throw new Error('offline');
	}
	override async get(): Promise<AgentRunSnapshot> {
		if (!this.snapshot) throw new Error('offline');
		return this.snapshot;
	}
}

class HydratingTransport extends FakeAgentRunTransport {
	constructor(private readonly session: Awaited<ReturnType<AgentRunTransport['getSession']>>) {
		super([]);
	}
	override async getSession(): Promise<Awaited<ReturnType<AgentRunTransport['getSession']>>> {
		return this.session;
	}
}

/**
 * Holds the transcript back until the test says otherwise, so the loading flag
 * can be observed mid-flight rather than only after the fetch settles.
 */
class DeferredHydrationTransport extends FakeAgentRunTransport {
	constructor() {
		super([]);
	}
	resolve!: (session: Awaited<ReturnType<AgentRunTransport['getSession']>>) => void;
	reject!: (reason: unknown) => void;
	override getSession(): Promise<Awaited<ReturnType<AgentRunTransport['getSession']>>> {
		return new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

const streamedEvents: AgentEvent[] = [
	{ type: 'text_delta', text: 'Let me check. ' },
	{ type: 'tool_started', callId: 'call-1', name: 'find_references', arguments: { query: 'x' } },
	{ type: 'tool_completed', callId: 'call-1', name: 'find_references', output: { count: 2 } },
	{ type: 'text_delta', text: 'Found two.' }
];

const sendWith = async (events: AgentEvent[]) => {
	const store = new ChatStore(
		'test-session',
		new FakeAgentRunTransport(events),
		new MemoryStorage()
	);
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
		const store = new ChatStore(
			'test-session',
			new FakeAgentRunTransport(streamedEvents),
			new MemoryStorage()
		);
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
			'test-session',
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
			'test-session',
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
		const store = new ChatStore('test-session', transport, new MemoryStorage());
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

describe('a stop the server never confirms', () => {
	const unconfirmed = async (snapshot?: AgentRunSnapshot) => {
		const transport = new UnconfirmedCancelTransport(snapshot);
		const store = new ChatStore('test-session', transport, new MemoryStorage());
		await store.send({ prompt: 'take your time' });
		await Promise.resolve();
		return { store, reply: store.entries.at(-1)! };
	};

	it('reconciles the settled run when the cancel request failed', async () => {
		const { store } = await unconfirmed({
			run: { id: runId, status: 'cancelled', conversationId },
			pendingDecisions: []
		} as unknown as AgentRunSnapshot);
		await store.stop();
		expect(store.isStreaming).toBe(false);
	});

	it('releases the composer when cancellation cannot be confirmed at all', async () => {
		const { store } = await unconfirmed();
		await store.stop();
		expect(store.isStreaming).toBe(false);
	});

	it('lets the next message through once the composer is released', async () => {
		const { store } = await unconfirmed();
		await store.stop();
		await store.send({ prompt: 'try again' });
		expect(store.entries.filter((entry) => entry.role === 'user').length).toBe(2);
	});
});

describe('restoring a conversation', () => {
	const hydrateWith = async (content: Readonly<Record<string, unknown>>) => {
		const session = {
			conversation: { id: conversationId },
			messages: [
				{
					id: '30000000-0000-4000-8000-000000000001',
					conversationId,
					role: 'user',
					content,
					createdAt: new Date().toISOString()
				}
			]
		} as unknown as Awaited<ReturnType<AgentRunTransport['getSession']>>;
		const store = new ChatStore(
			'test-session',
			new HydratingTransport(session),
			new MemoryStorage()
		);
		store.conversationId = conversationId;
		await store.hydrate();
		return store;
	};

	describe('the transcript loading flag', () => {
		const emptySession = {
			conversation: { id: conversationId },
			messages: []
		} as unknown as Awaited<ReturnType<AgentRunTransport['getSession']>>;

		it('is raised while the transcript is still in flight', () => {
			const transport = new DeferredHydrationTransport();
			const store = new ChatStore('test-session', transport, new MemoryStorage());
			store.conversationId = conversationId;
			void store.hydrate();
			transport.resolve(emptySession);
			expect(store.loading).toBe(true);
		});

		it('drops once the transcript arrives', async () => {
			const transport = new DeferredHydrationTransport();
			const store = new ChatStore('test-session', transport, new MemoryStorage());
			store.conversationId = conversationId;
			const hydration = store.hydrate();
			transport.resolve(emptySession);
			await hydration;
			expect(store.loading).toBe(false);
		});

		it('drops when hydration fails too', async () => {
			const transport = new DeferredHydrationTransport();
			const store = new ChatStore('test-session', transport, new MemoryStorage());
			store.conversationId = conversationId;
			const hydration = store.hydrate();
			transport.reject(new Error('offline'));
			await hydration;
			expect(store.loading).toBe(false);
		});
	});

	it('restores pasted images after the text of the turn', async () => {
		const store = await hydrateWith({
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
		});
		expect(store.entries.at(0)?.parts).toEqual([
			{ kind: 'text', text: 'What is this?' },
			{ kind: 'image', id: 'img-1', dataUrl: 'data:image/png;base64,AAA', name: 'shot.png' }
		]);
	});

	it('degrades a malformed images record to a text-only turn', async () => {
		const store = await hydrateWith({ type: 'text', text: 'Hi', images: 'not-an-array' });
		expect(store.entries.at(0)?.parts).toEqual([{ kind: 'text', text: 'Hi' }]);
	});
});

describe('a reopened turn reads as it happened', () => {
	const runId = '40000000-0000-4000-8000-0000000000ff';
	let nextId = 0;
	const stored = (
		role: 'user' | 'assistant' | 'tool',
		content: Readonly<Record<string, unknown>>,
		eventCursor?: string
	) => ({
		id: `50000000-0000-4000-8000-00000000000${++nextId}`,
		conversationId,
		role,
		content,
		...(role === 'user' ? {} : { runId }),
		...(eventCursor ? { eventCursor } : {}),
		createdAt: new Date().toISOString()
	});

	/**
	 * The journal writes tool activity as each call settles and the agent's own output when
	 * the run completes, so the stored order is not the order things happened. Cursors are.
	 */
	const reopened = async () => {
		const session = {
			conversation: { id: conversationId },
			messages: [
				stored('user', { type: 'text', text: 'shorten this note' }),
				stored('tool', { callId: 'c1', name: 'get_note', input: {}, status: 'succeeded' }, '2'),
				stored('tool', { callId: 'c2', name: 'save_note', input: {}, status: 'succeeded' }, '5'),
				stored('assistant', { type: 'reasoning', text: 'It has five bullets.' }, '1'),
				stored('assistant', { type: 'text', text: 'Reading it first.' }, '3'),
				stored('assistant', { type: 'text', text: 'Done.' }, '6')
			]
		} as unknown as Awaited<ReturnType<AgentRunTransport['getSession']>>;
		const store = new ChatStore(
			'test-session',
			new HydratingTransport(session),
			new MemoryStorage()
		);
		store.conversationId = conversationId;
		await store.hydrate();
		return store;
	};

	it('keeps the agent thinking, which used to be dropped on reopening', async () => {
		const store = await reopened();
		expect(store.entries.at(1)?.parts.some((part) => part.kind === 'reasoning')).toBe(true);
	});

	it('puts the turn back in the order the events arrived', async () => {
		const store = await reopened();
		expect(store.entries.at(1)?.parts.map((part) => part.kind)).toEqual([
			'reasoning',
			'tool',
			'text',
			'tool',
			'text'
		]);
	});

	it('reads one turn as one turn, however many messages it was written as', async () => {
		const store = await reopened();
		expect(store.entries.filter((entry) => entry.role === 'assistant')).toHaveLength(1);
	});

	/**
	 * A run that died holding an approval leaves the question journalled as still pending,
	 * because nothing later ever settled that call. Replayed as-is it put a live
	 * Approve/Reject card back on screen for a run that could not answer it — and answering
	 * it failed client-side only, so the card came back on every reload afterwards.
	 */
	/** Restore is the whole question here, so the live stream is left closed. */
	class QuietHydratingTransport extends HydratingTransport {
		override openEvents() {
			return { close() {} };
		}
	}

	const withParkedCall = async (latestRun?: Readonly<Record<string, unknown>>) => {
		const session = {
			conversation: { id: conversationId },
			messages: [
				stored('user', { type: 'text', text: 'change my default model' }),
				stored(
					'tool',
					{
						callId: 'c9',
						name: 'update_agent_preferences',
						input: { defaultModel: 'openai/gpt-5.6' },
						status: 'approval_required'
					},
					'1'
				)
			],
			...(latestRun ? { latestRun } : {})
		} as unknown as Awaited<ReturnType<AgentRunTransport['getSession']>>;
		const store = new ChatStore(
			'test-session',
			new QuietHydratingTransport(session),
			new MemoryStorage()
		);
		store.conversationId = conversationId;
		await store.hydrate();
		const parts = store.entries.at(1)?.parts ?? [];
		return parts.find((part) => part.kind === 'tool');
	};

	it('abandons a parked call whose run is no longer waiting', async () => {
		const part = await withParkedCall({
			run: { id: runId, status: 'failed', failure: 'The agent run failed.' },
			pendingDecisions: []
		});
		expect(part?.kind === 'tool' && part.tool.status).toBe('failed');
	});

	it('keeps the card live while its own run is still waiting on the answer', async () => {
		const part = await withParkedCall({
			run: { id: runId, status: 'awaiting_approval' },
			pendingDecisions: []
		});
		expect(part?.kind === 'tool' && part.tool.status).toBe('approval_required');
	});
});

/** Records what a send actually put on the wire, which is the whole subject below. */
class RecordingTransport extends FakeAgentRunTransport {
	submitted?: SubmitAgentRunInput;
	constructor() {
		super([]);
	}
	override async submit(input: SubmitAgentRunInput) {
		this.submitted = input;
		return { runId, conversationId, status: 'queued' as const, latestCursor: '0' };
	}
}

describe('the context a send carries', () => {
	const noteId = '30000000-0000-4000-8000-000000000001' as NoteId;
	const otherNoteId = '30000000-0000-4000-8000-000000000002' as NoteId;

	const pin = (text: string, from: number, id: NoteId = noteId): SelectionChip => ({
		kind: 'selection',
		id: `${id}:${from}-${from + text.length}`,
		name: 'Q3 planning',
		wordCount: 3,
		selection: { noteId: id, revision: 2, from, to: from + text.length, text }
	});

	const sentWith = async (chips: ContextChip[], live?: SelectionChip) => {
		const transport = new RecordingTransport();
		const store = new ChatStore('test-session', transport, new MemoryStorage());
		store.chips = chips;
		// The passage still following the caret is not a chip the store holds: the panel
		// derives it and hands it over on the request, exactly as it does here.
		await store.send({
			prompt: 'what does this commit me to?',
			...(live ? { selections: [live.selection] } : {})
		});
		return transport.submitted!;
	};

	it('sends every pinned passage', async () => {
		const sent = await sentWith([pin('ship it', 10), pin('then review', 40)]);
		expect(sent.selections).toHaveLength(2);
	});

	it('keeps the order the passages were pinned in', async () => {
		const sent = await sentWith([pin('ship it', 10), pin('then review', 40)]);
		expect(sent.selections?.[1]?.text).toBe('then review');
	});

	/** The selection-bound tools are offered on the strength of this field being set. */
	it('names the first pinned passage as the singular selection', async () => {
		const sent = await sentWith([pin('ship it', 10), pin('then review', 40)]);
		expect(sent.selection?.text).toBe('ship it');
	});

	it('sends passages pinned from different notes', async () => {
		const sent = await sentWith([pin('ship it', 10), pin('elsewhere', 4, otherNoteId)]);
		expect(sent.selections?.[1]?.noteId).toBe(otherNoteId);
	});

	it('sends the passage highlighted right now, with nothing pinned', async () => {
		const sent = await sentWith([], pin('the live one', 70));
		expect(sent.selections?.[0]?.text).toBe('the live one');
	});

	it('sends the highlighted passage alongside the pinned ones', async () => {
		const sent = await sentWith([pin('ship it', 10)], pin('the live one', 70));
		expect(sent.selections).toHaveLength(2);
	});

	/**
	 * Pinning is deliberate and highlighting is incidental, so the pin takes the singular
	 * field the selection-bound tools are offered on.
	 */
	it('lets a pin outrank the highlight for the singular selection', async () => {
		const sent = await sentWith([pin('ship it', 10)], pin('the live one', 70));
		expect(sent.selection?.text).toBe('ship it');
	});

	it('sends no selection when nothing was pinned', async () => {
		const sent = await sentWith([{ kind: 'note', id: noteId, name: 'Q3 planning' }]);
		expect(sent.selection).toBeUndefined();
	});

	it('leaves the plural field off entirely when nothing was pinned', async () => {
		const sent = await sentWith([]);
		expect(sent.selections).toBeUndefined();
	});

	it('still maps note chips onto the attached notes', async () => {
		const sent = await sentWith([
			{ kind: 'note', id: noteId, name: 'Q3 planning' },
			pin('ship it', 10)
		]);
		expect(sent.contextNoteIds).toEqual([noteId]);
	});
});
