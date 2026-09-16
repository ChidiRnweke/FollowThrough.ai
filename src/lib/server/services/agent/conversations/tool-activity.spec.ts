import { describe, expect, it } from 'vitest';
import { toolActivityFromEvent } from './tool-activity';

describe('Turning an event into the journal row it calls for', () => {
	it('journals a reported failure with the value the failure was read out of', () => {
		expect(
			toolActivityFromEvent({
				type: 'tool_reported_failure',
				callId: 'call-9',
				name: 'edit_note',
				failure: 'No edits were applied.',
				output: { problems: 1 }
			})
		).toEqual({
			callId: 'call-9',
			name: 'edit_note',
			input: {},
			failure: 'No edits were applied.',
			output: { problems: 1 },
			status: 'reported_failure'
		});
	});

	it('has no row for an event that is not about a tool call', () => {
		expect(toolActivityFromEvent({ type: 'text_delta', text: 'Done.' })).toBeUndefined();
	});
});
