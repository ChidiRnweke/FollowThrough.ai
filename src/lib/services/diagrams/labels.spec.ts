import { expect, it } from 'vitest';
import { DiagramLabelPresentationService } from './labels';
const labels = new DiagramLabelPresentationService();

it('normalizes and deduplicates visible labels while preserving their first appearance', () => {
	expect(labels.labels([' Queue\n worker ', '', 'API', 'Queue worker', '\u00a0'])).toEqual([
		'Queue worker',
		'API'
	]);
});

it('separates searchable labels with newlines', () => {
	expect(labels.searchText([' API ', 'Queue', 'API'])).toBe('API\nQueue');
});

it('reports added, removed and unchanged labels for an edit', () => {
	expect(labels.compare(['Browser', 'Database'], ['Browser', 'Queue'])).toEqual({
		added: ['Queue'],
		removed: ['Database'],
		kept: 1
	});
});
