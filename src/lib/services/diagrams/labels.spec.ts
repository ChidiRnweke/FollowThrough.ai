import { expect, it } from 'vitest';
import { drawioLabelDiff, normalizedDrawioLabels, searchableDrawioText } from './labels';

it('normalizes and deduplicates visible labels while preserving their first appearance', () => {
	expect(normalizedDrawioLabels([' Queue\n worker ', '', 'API', 'Queue worker', '\u00a0'])).toEqual(
		['Queue worker', 'API']
	);
});

it('separates searchable labels with newlines', () => {
	expect(searchableDrawioText([' API ', 'Queue', 'API'])).toBe('API\nQueue');
});

it('reports added, removed and unchanged labels for an edit', () => {
	expect(drawioLabelDiff(['Browser', 'Database'], ['Browser', 'Queue'])).toEqual({
		added: ['Queue'],
		removed: ['Database'],
		kept: 1
	});
});
