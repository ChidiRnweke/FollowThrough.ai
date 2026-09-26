import { expect, it } from 'vitest';
import { readDrawioLabels } from './labels';
import { RICH_DRAWIO_LABELS_XML } from '$lib/testing/diagrams/fixtures/drawio';

it('reads rich, repeated and blank labels with the same policy as server publication', () => {
	expect(readDrawioLabels(RICH_DRAWIO_LABELS_XML)).toEqual({
		kind: 'labels',
		labels: ['Browser', 'Queue']
	});
});
