import { describe, expect, it } from 'vitest';
import type { FunctionCallResultSessionItem } from '$lib/models/agent/session-item';
import { ConversationHistoryService } from './history';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
const history = new ConversationHistoryService(new InMemoryAgentSessionRepository());
describe('the text a tool result carries', () => {
	const result = (output: FunctionCallResultSessionItem['output']) =>
		history
			.diagramResults([
				{
					type: 'function_call_result',
					name: 'create_diagram',
					callId: 'call-1',
					status: 'completed',
					output
				}
			])
			.at(0)?.text;

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
