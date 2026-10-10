import { expect, it } from 'vitest';
import { AgentToolResultSelection } from './tool-result-selection';

const selection = new AgentToolResultSelection();
it('filters nested arrays inclusively and keeps rows without a string creation time', () => {
	const result = selection.select(
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
		selection.select(
			{ createdAt: '2026-01-01', number: 4, empty: null, enabled: true },
			{ createdAfter: '2026-02-01' }
		)
	).toEqual({ createdAt: '2026-01-01', number: 4, empty: null, enabled: true });
});
it('retains all rows when no bounds are supplied', () => {
	expect(selection.select([{ createdAt: '2026-01-01' }, { createdAt: '2026-12-31' }], {})).toEqual([
		{ createdAt: '2026-01-01' },
		{ createdAt: '2026-12-31' }
	]);
});
it('ignores non-string bounds while applying the supplied string bound', () => {
	expect(
		selection.select([{ createdAt: '2026-01-01' }, { createdAt: '2026-03-01' }], {
			createdAfter: '2026-02-01',
			createdBefore: null
		})
	).toEqual([{ createdAt: '2026-03-01' }]);
});
