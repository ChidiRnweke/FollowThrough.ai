import { expect, it } from 'vitest';
import { AgentStreamPresentationService } from './stream-presentation';
const presentation = new AgentStreamPresentationService();
it('keeps reported failure details in the tool result instead of losing its output', () => {
	const output = { kind: 'failure', code: 'STALE_REVIEW', message: 'Read the note again' };
	expect(
		presentation.outcome(
			{ callId: 'call-1', name: 'save_note' },
			{ kind: 'reported_failure', value: output, failure: 'Read the note again' }
		)
	).toEqual({
		type: 'tool_reported_failure',
		callId: 'call-1',
		name: 'save_note',
		output,
		failure: 'Read the note again'
	});
});
it('ends streamed reasoning suppression at the completed generation', () => {
	expect(
		presentation.reasoning({ type: 'reasoning_item', text: 'Already streamed' }, true)
	).toEqual({ streamed: false });
});
