import { toolFailure } from '$lib/models/agent/tool-failure';
import { expect, it } from 'vitest';
import { durableDiagramFixture } from '$lib/testing/diagrams/fixtures/durable-generation';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('journals mapped provider calls in order and retains reported failure detail', async () => {
	const state = durableDiagramFixture();
	state.provider.events = [
		{
			type: 'tool_called',
			call: {
				callId: 'read',
				name: 'get_note',
				arguments: { noteId: testNoteId() },
				output: { kind: 'none' }
			}
		},
		{
			type: 'tool_output',
			call: {
				callId: 'read',
				name: 'get_note',
				arguments: {},
				output: {
					kind: 'value',
					value: toolFailure('NOT_FOUND', 'Unavailable', 'Read another note.', {
						reason: 'archived'
					})
				}
			}
		},
		{
			type: 'tool_output',
			call: { callId: 'other', name: 'get_note', arguments: {}, output: { kind: 'none' } }
		}
	];
	await state.controller.reviseInlineMermaid(testActor(), {
		noteId: testNoteId(),
		source: 'flowchart LR\nA --> B',
		instruction: 'Add a queue'
	});
	expect(
		state.conversations.messages
			.filter((message) => message.role === 'tool')
			.map((message) => message.content)
	).toStrictEqual([
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
			output: toolFailure('NOT_FOUND', 'Unavailable', 'Read another note.', { reason: 'archived' }),
			failure: 'Unavailable'
		},
		{
			type: 'tool_activity',
			callId: 'other',
			name: 'get_note',
			input: {},
			status: 'succeeded',
			output: null,
			failure: null
		}
	]);
});
