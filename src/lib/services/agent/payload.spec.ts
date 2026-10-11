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

describe('Filtering a tool result by creation time', () => {
	const inspection = new AgentPayloadInspectionService();
	it('filters nested arrays inclusively and keeps rows without a string creation time', () => {
		const result = inspection.filterResult(
			{
				groups: [
					{
						rows: [
							{ id: 'old', createdAt: '2026-01-01' },
							{ id: 'start', createdAt: '2026-02-01' },
							{ id: 'end', createdAt: '2026-02-28' },
							{ id: 'new', createdAt: '2026-03-01' },
							{ id: 'undated' },
							{ id: 'numeric', createdAt: 42 },
							'scalar'
						]
					}
				]
			},
			{ createdAfter: '2026-02-01', createdBefore: '2026-02-28' }
		);
		expect(result).toEqual({
			groups: [
				{
					rows: [
						{ id: 'start', createdAt: '2026-02-01' },
						{ id: 'end', createdAt: '2026-02-28' },
						{ id: 'undated' },
						{ id: 'numeric', createdAt: 42 },
						'scalar'
					]
				}
			]
		});
	});
	it('keeps standalone objects and scalar values even outside the array filter range', () => {
		expect(
			inspection.filterResult(
				{ createdAt: '2026-01-01', number: 4, empty: null, enabled: true },
				{ createdAfter: '2026-02-01' }
			)
		).toEqual({ createdAt: '2026-01-01', number: 4, empty: null, enabled: true });
	});
	it('retains all rows when no bounds are supplied', () => {
		expect(
			inspection.filterResult([{ createdAt: '2026-01-01' }, { createdAt: '2026-12-31' }], {})
		).toEqual([{ createdAt: '2026-01-01' }, { createdAt: '2026-12-31' }]);
	});
	it('ignores non-string bounds while applying the supplied string bound', () => {
		expect(
			inspection.filterResult([{ createdAt: '2026-01-01' }, { createdAt: '2026-03-01' }], {
				createdAfter: '2026-02-01',
				createdBefore: null
			})
		).toEqual([{ createdAt: '2026-03-01' }]);
	});
});
