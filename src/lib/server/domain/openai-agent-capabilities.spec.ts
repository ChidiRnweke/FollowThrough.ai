import { describe, expect, it } from 'vitest';
import type { AgentEvent, ConversationId } from '$lib/models';
import type { AgentRunStore } from '$lib/services';
import { AgentToolEventMapper, OpenAIAgentRunner } from './openai-agent-capabilities';
import { BasicAgent } from './basic-agent';
import { InMemoryAgentRunner } from '$lib/testing/fakes/in-memory-agent';
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
	it('uses the deterministic runner when no API key is configured', async () => {
		const fallback = new InMemoryAgentRunner();
		fallback.events = [{ type: 'text_delta', text: 'fallback response' }];
		const runner = new OpenAIAgentRunner(
			() => {
				throw new Error('Unexpected controller access');
			},
			{} as AgentRunStore,
			fallback,
			''
		);
		const events = await collect(runner.run(testActor(), { prompt: 'Help' }, {}));
		expect(events).toEqual([{ type: 'text_delta', text: 'fallback response' }]);
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
