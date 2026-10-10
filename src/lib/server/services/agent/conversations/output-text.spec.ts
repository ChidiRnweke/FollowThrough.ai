import { describe, expect, it } from 'vitest';
import type { FunctionCallResultSessionItem } from '$lib/models/agent/session-item';
import { sessionOutputText } from './buffer';
describe('the text a tool result carries', () => {
	const result = (output: FunctionCallResultSessionItem['output']) =>
		sessionOutputText({
			type: 'function_call_result',
			name: 'search',
			callId: 'call-1',
			status: 'completed',
			output
		});

	it('reads the bare string form', () => {
		expect(result('done')).toBe('done');
	});

	it('reads the text part form', () => {
		expect(result({ type: 'text', text: 'done' })).toBe('done');
	});

	it('reports nothing for the multi-part form, which carries no single text', () => {
		expect(result([{ type: 'text', text: 'first' }])).toBeUndefined();
	});
});
