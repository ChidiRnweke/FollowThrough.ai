import { expect, it } from 'vitest';
import { createDiagramReviews } from '$lib/factories/diagrams/reviews';
const reviews = createDiagramReviews();
import { RICH_DRAWIO_LABELS_XML } from '$lib/testing/diagrams/fixtures/drawio';

it('reads rich, repeated and blank labels with the same policy as server publication', () => {
	expect(reviews.read(RICH_DRAWIO_LABELS_XML)).toEqual({
		kind: 'labels',
		labels: ['Browser', 'Queue']
	});
});
