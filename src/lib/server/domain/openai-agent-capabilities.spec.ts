import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AgentEvent, ConversationId } from '$lib/models';
import type { AgentRunStore } from '$lib/services';
import type { AgentSessionRepository } from '$lib/repositories';
import { AgentToolEventMapper, OpenAIAgentRunner } from './openai-agent-capabilities';
import { BasicAgent } from './basic-agent';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/fakes/in-memory-automation';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';

const collect = async (events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> => {
	const collected: AgentEvent[] = [];
	for await (const event of events) collected.push(event);
	return collected;
};

describe('Agent runtime boundary', () => {
	it('fails clearly when no API key is configured', async () => {
		const runner = new OpenAIAgentRunner(
			() => {
				throw new Error('Unexpected controller access');
			},
			{} as AgentRunStore,
			{} as AgentSessionRepository,
			''
		);
		await expect(collect(runner.run(testActor(), { prompt: 'Help' }, {}))).rejects.toThrow(
			'OPENROUTER_API_KEY'
		);
	});
});

describe('Agent tool event invariants', () => {
	it('maps an SDK tool call to a domain start event', () => {
		const event = new AgentToolEventMapper().map({
			type: 'run_item_stream_event',
			name: 'tool_called',
			item: { toJSON: () => ({ rawItem: { callId: 'call-1', name: 'relate_selection' } }) }
		});
		expect(event).toEqual({
			type: 'tool_started',
			callId: 'call-1',
			name: 'relate_selection',
			arguments: {},
			output: undefined
		});
	});

	it('preserves the tool name when mapping its SDK output event', () => {
		const mapper = new AgentToolEventMapper();
		mapper.map({
			type: 'run_item_stream_event',
			name: 'tool_called',
			item: { toJSON: () => ({ rawItem: { callId: 'call-1', name: 'find_references' } }) }
		});
		const event = mapper.map({
			type: 'run_item_stream_event',
			name: 'tool_output',
			item: { toJSON: () => ({ rawItem: { callId: 'call-1' } }) }
		});
		expect(event).toEqual({
			type: 'tool_completed',
			callId: 'call-1',
			name: 'find_references'
		});
	});

	it('reads the call id exposed by an SDK output item getter', () => {
		const mapper = new AgentToolEventMapper();
		mapper.map({
			type: 'run_item_stream_event',
			name: 'tool_called',
			item: { toJSON: () => ({ rawItem: { callId: 'call-getter', name: 'find_references' } }) }
		});
		const event = mapper.map({
			type: 'run_item_stream_event',
			name: 'tool_output',
			item: {
				callId: 'call-getter',
				toJSON: () => ({ rawItem: { type: 'function_call_result' } })
			}
		});
		expect(event).toMatchObject({ callId: 'call-getter', name: 'find_references' });
	});

	it('maps a controller failure returned by the tool boundary', () => {
		const event = new AgentToolEventMapper().map({
			type: 'run_item_stream_event',
			name: 'tool_output',
			item: {
				toJSON: () => ({
					rawItem: { callId: 'call-2', name: 'create_note', output: '{"failure":"Denied"}' }
				})
			}
		});
		expect(event).toMatchObject({ type: 'tool_completed', callId: 'call-2', failure: 'Denied' });
	});

	it('reads SDK tool output from the run item boundary', () => {
		const event = new AgentToolEventMapper().map({
			type: 'run_item_stream_event',
			name: 'tool_output',
			item: {
				output: '{"failure":"Denied at controller"}',
				toJSON: () => ({ rawItem: { callId: 'call-3', name: 'save_note' } })
			}
		});
		expect(event).toMatchObject({ failure: 'Denied at controller' });
	});
});

describe('OpenRouter-compatible SDK integration', () => {
	it('streams a completion through an OpenAI-compatible base URL', async () => {
		const server = createServer((request, response) => {
			if (request.url !== '/v1/chat/completions') {
				response.writeHead(404).end();
				return;
			}
			response.writeHead(200, { 'content-type': 'text/event-stream' });
			response.write(
				`data: ${JSON.stringify({ id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 1, model: 'local/test', choices: [{ index: 0, delta: { role: 'assistant', content: 'Local response' }, finish_reason: null }] })}\n\n`
			);
			response.write(
				`data: ${JSON.stringify({ id: 'chatcmpl-local', object: 'chat.completion.chunk', created: 1, model: 'local/test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`
			);
			response.end('data: [DONE]\n\n');
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Local server did not bind');
		const conversationId = '00000000-0000-4000-8000-000000000099' as ConversationId;
		const timestamp = '2026-01-01T00:00:00.000Z' as never;
		const runStore: AgentRunStore = {
			create: async (actor, input) => ({
				id: '00000000-0000-4000-8000-000000000098' as never,
				userId: actor.userId,
				...input,
				status: 'running',
				pendingDecisions: [],
				definitionVersion: 1,
				createdAt: timestamp,
				updatedAt: timestamp
			}),
			get: async () => {
				throw new Error('Not used');
			},
			pause: async () => {
				throw new Error('Not used');
			},
			complete: async () => {
				return {} as never;
			},
			fail: async () => {
				return {} as never;
			},
			cancel: async () => {
				return {} as never;
			}
		};
		const items: Readonly<Record<string, unknown>>[] = [];
		const sessions: AgentSessionRepository = {
			list: async () =>
				items.map((item, position) => ({
					id: crypto.randomUUID() as never,
					conversationId,
					position,
					item,
					createdAt: timestamp
				})),
			append: async (_actor, _conversationId, added) => {
				items.push(...added);
			},
			pop: async () => undefined,
			clear: async () => undefined
		};
		const runner = new OpenAIAgentRunner(
			() => ({}) as never,
			runStore,
			sessions,
			'local-key',
			`http://127.0.0.1:${address.port}/v1`
		);
		try {
			const events = await collect(
				runner.run(
					testActor(),
					{ conversationId, prompt: 'Hello' },
					{
						conversationId,
						effectiveModel: 'local/test',
						executionMode: 'approval_required',
						provenanceId: testProvenanceId()
					}
				)
			);
			expect(events).toContainEqual({ type: 'text_delta', text: 'Local response' });
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
});

describe('Agent context and suggestion invariants', () => {
	it('derives the active project from the current note', async () => {
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const agent = new BasicAgent(undefined, undefined, notes);
		const context = await agent.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Summarize this note' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.projectId).toBe(testProjectId());
	});

	it('scopes a fallback todo suggestion to the active project', async () => {
		const suggestions = new InMemorySuggestions();
		const provenance = new InMemoryProvenanceRecorder();
		const agent = new BasicAgent(suggestions, provenance);
		const events = await collect(
			agent.run(
				testActor(),
				{ noteId: testNoteId(), prompt: 'Create a todo send the design' },
				{ projectId: testProjectId() }
			)
		);
		const suggestion = events.find((event) => event.type === 'suggestion');
		expect(
			suggestion?.type === 'suggestion' && suggestion.suggestion.kind === 'todo'
				? suggestion.suggestion.payload.projectId
				: undefined
		).toBe(testProjectId());
	});

	it('preserves an existing conversation identifier', async () => {
		const conversationId = '00000000-0000-4000-8000-000000000099' as ConversationId;
		const agent = new BasicAgent();
		const events = await collect(agent.run(testActor(), { conversationId, prompt: 'Help' }, {}));
		const completed = events.find((event) => event.type === 'completed');
		expect(completed?.type === 'completed' ? completed.conversationId : undefined).toBe(
			conversationId
		);
	});
});
