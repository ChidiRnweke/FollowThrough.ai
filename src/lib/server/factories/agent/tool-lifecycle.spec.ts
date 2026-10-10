import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
const noteMarkdown = new NodeNoteMarkdown();
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { describe, it, expect } from 'vitest';
import { Agent, Runner, RunState } from '@openai/agents';
import { AgentTools } from './agent-tool-factory';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';

import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import {
	InMemoryToolCallingModel,
	InMemoryToolBatchModel
} from '$lib/testing/agent/fakes/in-memory-tool-calling-model';
import type { NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';

import { parseProviderStreamEvent } from '$lib/server/adapters/agent/provider-events';
import type { AgentEvent } from '$lib/models/agent';
import {
	noteBuilder,
	testActor,
	testProvenanceId,
	testConversationId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { AgentExecutionMode, PendingAgentDecision } from '$lib/models/agent';

const scenario = (
	count: number,
	mode: AgentExecutionMode,
	options: {
		executor?: AgentToolExecutor;
		signal?: AbortSignal;
		markdown?: NotesDependencies['markdown'];
	} = {}
) => {
	const note = noteBuilder({ ...noteMarkdown.read('Launch Monday.'), title: 'Release' });
	const fixture = reviewedNoteFixture(note, options.markdown);
	const createRegistry = (pending: readonly PendingAgentDecision[] = []) =>
		new AgentTools(
			testTokenizer,
			fixture.factory,
			testActor(),
			mode,
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Change launch day' },
				model: 'test-model'
			},
			options.executor ?? { execute: (_call, action) => action() },
			new InMemoryToolRetriever(),
			{ isEnabled: () => true },
			pending,
			options.signal ?? new AbortController().signal
		);
	const registry = createRegistry();
	const edit = { oldText: 'Monday', newText: 'Tuesday' };
	const model = new InMemoryToolCallingModel(
		'edit_note',
		JSON.stringify({
			noteId: note.id,
			edits: Array.from({ length: count }, () => (count === 6 ? { oldText: edit.oldText } : edit))
		}),
		JSON.stringify({ noteId: note.id, edits: [edit] }),
		count === 0 ? 'Too small' : 'newText'
	);
	const agent = new Agent({ name: 'Tool lifecycle', model, tools: registry.tools() });
	return { ...fixture, note, registry, createRegistry, model, agent };
};

const run = async (agent: Agent, state?: RunState<unknown, Agent>, events: AgentEvent[] = []) => {
	const stream = await new Runner({ tracingDisabled: true }).run(
		agent,
		state ?? 'Change launch day',
		{ stream: true, maxTurns: 4 }
	);
	const mapper = createAgentStream().tools;
	for await (const event of stream) {
		const mapped = mapper.map(parseProviderStreamEvent(event));
		if (mapped) events.push(mapped);
	}
	await stream.completed;
	return stream;
};

describe('Tool argument recovery through the SDK runner', () => {
	for (const count of [0, 6]) {
		it(`corrects ${count} incomplete edits after receiving the validation failure`, async () => {
			const fixture = scenario(count, 'auto_accept');
			await run(fixture.agent);
			expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
		});
		it(`does not request approval until ${count} incomplete edits are corrected`, async () => {
			const fixture = scenario(count, 'approval_required');
			const result = await run(fixture.agent);
			expect({
				calls: result.interruptions.map((item) =>
					item.rawItem.type === 'function_call' ? item.rawItem.callId : 'unexpected'
				),
				body: fixture.content.notes[0].plainText
			}).toEqual({ calls: ['call-corrected'], body: 'Launch Monday.' });
		});
	}
});

const resume = async (fixture: ReturnType<typeof scenario>, rejected = false) => {
	const first = await run(fixture.agent);
	const pending = fixture.registry.reviewDecision({
		callId: 'call-corrected',
		toolName: 'edit_note',
		arguments: { noteId: fixture.note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] }
	});
	const registry = fixture.createRegistry([pending]);
	const agent = new Agent({
		name: 'Tool lifecycle',
		model: fixture.model,
		tools: registry.tools()
	});
	const state = await RunState.fromString(agent, first.state.toString());
	for (const interruption of state.getInterruptions()) {
		if (rejected) state.reject(interruption);
		else state.approve(interruption);
	}
	return { agent, state };
};

describe('Reviewed tool recovery and terminal boundaries', () => {
	it('applies a corrected call after a serialized approval resumes in a fresh registry', async () => {
		const fixture = scenario(0, 'approval_required');
		const resumed = await resume(fixture);
		await run(resumed.agent, resumed.state);
		expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
	});
	it('does not write a rejected corrected call', async () => {
		const fixture = scenario(0, 'approval_required');
		const resumed = await resume(fixture, true);
		await run(resumed.agent, resumed.state);
		expect(fixture.content.notes[0].plainText).toBe('Launch Monday.');
	});
	it('reports a stale saved review without overwriting a newer edit', async () => {
		const fixture = scenario(0, 'approval_required');
		const resumed = await resume(fixture);
		fixture.content.notes = [
			{ ...fixture.note, ...noteMarkdown.read('Launch Friday.'), currentRevision: 2 }
		];
		const events: AgentEvent[] = [];
		await run(resumed.agent, resumed.state, events);
		expect({
			body: fixture.content.notes[0].plainText,
			failed: events.some(
				(event) => event.type === 'tool_reported_failure' && event.failure.includes('changed')
			)
		}).toEqual({ body: 'Launch Friday.', failed: true });
	});
	it('emits the failed call and corrected success with their identities', async () => {
		const fixture = scenario(0, 'auto_accept');
		const events: AgentEvent[] = [];
		await run(fixture.agent, undefined, events);
		expect(
			events
				.filter(
					(event) => event.type === 'tool_reported_failure' || event.type === 'tool_succeeded'
				)
				.map((event) => ({ type: event.type, callId: event.callId }))
		).toEqual([
			{ type: 'tool_reported_failure', callId: 'call-invalid' },
			{ type: 'tool_succeeded', callId: 'call-corrected' }
		]);
	});
	it('stops on persistence failure after a write rather than feeding back retry advice', async () => {
		const fixture = scenario(0, 'auto_accept', {
			executor: {
				execute: async (_call, action) => {
					await action();
					throw new Error('journal unavailable');
				}
			}
		});
		const outcome = await run(fixture.agent).catch((error) => ({
			kind: 'failure',
			message: error.message
		}));
		expect({
			outcome,
			body: fixture.content.notes[0].plainText,
			revision: fixture.content.notes[0].currentRevision
		}).toEqual({
			outcome: {
				kind: 'failure',
				message: 'Failed to run function tools: Error: journal unavailable'
			},
			body: 'Launch Tuesday.',
			revision: 2
		});
	});
	it('keeps cancellation terminal during tool execution', async () => {
		const cancellation = new AbortController();
		const fixture = scenario(0, 'auto_accept', {
			signal: cancellation.signal,
			executor: {
				execute: async (_call, action) => {
					cancellation.abort(new Error('cancelled by user'));
					return action();
				}
			}
		});
		await expect(run(fixture.agent)).rejects.toThrow('cancelled by user');
	});
});

describe('All tool registrations validate before approval', () => {
	it('validates an ordinary mutation without requesting approval for invalid arguments', async () => {
		const fixture = scenario(0, 'approval_required');
		const model = new InMemoryToolCallingModel(
			'rename_note',
			JSON.stringify({ noteId: fixture.note.id }),
			JSON.stringify({ noteId: fixture.note.id, title: 'New title' }),
			'title'
		);
		const result = await run(
			new Agent({ name: 'Mutation validation', model, tools: fixture.registry.tools() })
		);
		expect(
			result.interruptions.map((item) =>
				item.rawItem.type === 'function_call' ? item.rawItem.callId : 'unexpected'
			)
		).toEqual(['call-corrected']);
	});
	it('delivers read argument failures to the next generation', async () => {
		const fixture = scenario(0, 'auto_accept');
		const model = new InMemoryToolCallingModel(
			'list_note_versions',
			'{}',
			JSON.stringify({ noteId: fixture.note.id }),
			'noteId'
		);
		const result = await run(
			new Agent({ name: 'Read validation', model, tools: fixture.registry.tools() })
		);
		expect(result.finalOutput).toBe('Recovered');
	});
	it('delivers discovery argument failures through the same boundary', async () => {
		const fixture = scenario(0, 'auto_accept');
		const model = new InMemoryToolCallingModel(
			'search_tools',
			JSON.stringify({ query: 42 }),
			JSON.stringify({ query: 'notes' }),
			'query'
		);
		const result = await run(
			new Agent({ name: 'Discovery validation', model, tools: fixture.registry.agentTools() })
		);
		expect(result.finalOutput).toBe('Recovered');
	});
});

it('delivers an internal preparation fault to the model without exposing internals', async () => {
	const fixture = scenario(1, 'approval_required', {
		markdown: {
			read: () => {
				throw new TypeError('private converter implementation');
			},
			write: noteMarkdown.write
		}
	});
	const events: AgentEvent[] = [];
	const result = await run(fixture.agent, undefined, events);
	expect({
		final: result.finalOutput,
		failed: events
			.filter((event) => event.type === 'tool_reported_failure')
			.map((event) => event.failure),
		body: fixture.content.notes[0].plainText
	}).toEqual({
		final: 'Blocked',
		failed: [
			'The application failed while handling this call. The fault is ours, not your arguments.'
		],
		body: 'Launch Monday.'
	});
});

it('normalizes strict optional nulls consistently before approval and execution', async () => {
	const fixture = scenario(0, 'auto_accept');
	const model = new InMemoryToolCallingModel(
		'edit_note',
		JSON.stringify({
			noteId: fixture.note.id,
			edits: [{ oldText: 'Monday', newText: 'Tuesday', replaceAll: null }]
		}),
		'{}',
		'never correct'
	);
	await run(new Agent({ name: 'Strict optional input', model, tools: fixture.registry.tools() }));
	expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
});

it('isolates concurrent invalid and valid calls to the same tool', async () => {
	const fixture = scenario(0, 'auto_accept');
	const model = new InMemoryToolBatchModel([
		{
			name: 'edit_note',
			callId: 'invalid',
			arguments: JSON.stringify({ noteId: fixture.note.id, edits: [] })
		},
		{
			name: 'edit_note',
			callId: 'valid',
			arguments: JSON.stringify({
				noteId: fixture.note.id,
				edits: [{ oldText: 'Monday', newText: 'Tuesday' }]
			})
		}
	]);
	const events: AgentEvent[] = [];
	await run(
		new Agent({ name: 'Concurrent validation', model, tools: fixture.registry.tools() }),
		undefined,
		events
	);
	expect({
		body: fixture.content.notes[0].plainText,
		results: events
			.filter((event) => event.type === 'tool_reported_failure' || event.type === 'tool_succeeded')
			.map((event) => ({ type: event.type, callId: event.callId }))
			.sort((left, right) => String(left.callId).localeCompare(String(right.callId)))
	}).toEqual({
		body: 'Launch Tuesday.',
		results: [
			{ type: 'tool_reported_failure', callId: 'invalid' },
			{ type: 'tool_succeeded', callId: 'valid' }
		]
	});
});
