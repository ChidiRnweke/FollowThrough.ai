import { toolFailure } from '$lib/models/agent/tool-failure';
import { expect, it, vi } from 'vitest';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('journals projected activities in event order with durable provenance and failure output', async () => {
	const state = agentSubmissionFixture();
	state.runner.events = [
		{ type: 'tool_started', callId: 'read', name: 'get_note', arguments: { noteId: testNoteId() } },
		{
			type: 'tool_reported_failure',
			callId: 'read',
			name: 'get_note',
			failure: 'Unavailable',
			output: toolFailure('NOT_FOUND', 'Unavailable', 'Read another note.', { reason: 'archived' })
		},
		{ type: 'tool_succeeded', name: 'get_note' }
	];
	const receipt = await state.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Read the note.'
	});
	state.release();
	await vi.waitFor(() => {
		if (state.runs.runs.find((run) => run.id === receipt.runId)?.status !== 'completed')
			throw new Error('Run has not completed');
	});
	const events = state.runs.events.filter(
		({ event }) =>
			event.type === 'tool_started' ||
			event.type === 'tool_reported_failure' ||
			event.type === 'tool_succeeded'
	);
	const messages = state.conversations.messages.filter((message) => message.role === 'tool');
	expect({
		content: messages.map((message) => message.content),
		provenance: messages.map(({ runId, eventCursor }) => ({ runId, eventCursor }))
	}).toStrictEqual({
		content: [
			{
				type: 'tool_activity',
				callId: 'read',
				name: 'get_note',
				input: { noteId: testNoteId() },
				status: 'running',
				output: null,
				failure: null
			},
			{
				type: 'tool_activity',
				callId: 'read',
				name: 'get_note',
				input: {},
				status: 'reported_failure',
				output: toolFailure('NOT_FOUND', 'Unavailable', 'Read another note.', {
					reason: 'archived'
				}),
				failure: 'Unavailable'
			},
			{
				type: 'tool_activity',
				callId: null,
				name: 'get_note',
				input: {},
				status: 'succeeded',
				output: null,
				failure: null
			}
		],
		provenance: events.map(({ runId, cursor }) => ({ runId, eventCursor: cursor }))
	});
});
