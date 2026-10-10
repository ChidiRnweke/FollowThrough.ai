import { describe, expect, it } from 'vitest';
import { AgentPayloadInspectionService } from '$lib/services/agent/payload';
const { agentPayloadItems, isAgentPayloadObject } = new AgentPayloadInspectionService();
describe('Picking an arm of the payload union', () => {
	it('does not mistake an array for an object', () => {
		expect(isAgentPayloadObject([])).toBe(false);
	});

	it('does not mistake null for an object', () => {
		expect(isAgentPayloadObject(null)).toBe(false);
	});

	it('answers with the elements of an array', () => {
		expect(agentPayloadItems(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('answers with nothing for a value that is not an array', () => {
		expect(agentPayloadItems({ 0: 'a' })).toBeUndefined();
	});
});
