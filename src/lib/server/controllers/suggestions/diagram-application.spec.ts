import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { diagramSuggestionFixture as setup } from '$lib/testing/suggestions/fixtures/diagram-application';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';

describe('Diagram suggestion application', () => {
	it('refuses invalid draw.io source', async () => {
		const { controller, input } = setup('<mxfile />');
		await expect(controller.acceptReviewed(testActor(), input)).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
	it('persists the accepted diagram with its searchable labels', async () => {
		const { controller, diagrams, input } = setup();
		await controller.acceptReviewed(testActor(), input);
		expect(diagrams.diagrams[0]).toMatchObject({
			kind: 'drawio',
			source: VALID_DRAWIO_XML,
			searchableText: 'API & worker'
		});
	});
	it('rolls back diagram creation when acceptance persistence fails', async () => {
		const { controller, diagrams, suggestions, input } = setup();
		suggestions.failAcceptance = true;
		await controller.acceptReviewed(testActor(), input).catch(() => undefined);
		expect(diagrams.diagrams).toEqual([]);
	});
	it('keeps the proposal pending when indexing fails', async () => {
		const { controller, diagrams, suggestions, input } = setup();
		diagrams.failIndex = true;
		await controller.acceptReviewed(testActor(), input).catch(() => undefined);
		expect(suggestions.suggestions[0].status).toBe('proposed');
	});
});
