import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';

const setup = () => {
	const fixture = diagramGenerationFixture();
	const suggestions = new InMemorySuggestions();
	const controller = new Diagrams(
		capabilityDependencies<DiagramsDependencies>({
			...fixture,
			drawioXmlValidator: new DrawioXmlValidator(),
			suggestionCreator: suggestions,
			transactionRunner: new InMemoryTransactionRunner([suggestions, fixture.persistence])
		})
	);
	return { ...fixture, controller, suggestions };
};

const revision = {
	noteId: testNoteId(),
	source: 'flowchart LR\nA --> B',
	instruction: 'Add a queue'
};

describe('Diagram generation run settlement', () => {
	it('fails the run when the generated draw.io proposal cannot be saved', async () => {
		const { controller, persistence, suggestions } = setup();
		suggestions.failCreation = true;
		await controller
			.convertInlineMermaid(testActor(), {
				noteId: testNoteId(),
				source: revision.source
			})
			.catch(() => undefined);
		expect(persistence.runs.map(({ status, failure }) => ({ status, failure }))).toEqual([
			{ status: 'failed', failure: 'Suggestion creation failed' }
		]);
	});

	it('marks the run failed when its source note cannot be loaded during preparation', async () => {
		const { controller, persistence } = setup();
		await controller
			.reviseInlineMermaid(testActor(), { ...revision, noteId: testNoteId(2) })
			.catch(() => undefined);
		expect(persistence.runs.map((run) => ({ status: run.status, failure: run.failure }))).toEqual([
			{ status: 'failed', failure: 'Note was not found' }
		]);
	});

	it('marks the run failed when the provider stops without producing a diagram', async () => {
		const { controller, persistence, provider } = setup();
		provider.failure = new Error('Provider connection lost');
		await controller.reviseInlineMermaid(testActor(), revision).catch(() => undefined);
		expect(persistence.runs.map((run) => ({ status: run.status, failure: run.failure }))).toEqual([
			{ status: 'failed', failure: 'Provider connection lost' }
		]);
	});

	it('completes a run after its Mermaid submission passes validation', async () => {
		const { controller, persistence } = setup();
		await controller.reviseInlineMermaid(testActor(), revision);
		expect(persistence.runs.map((run) => run.status)).toEqual(['completed']);
	});

	it('lets the provider correct rejected draw.io XML before accepting its next submission', async () => {
		const { controller, provider } = setup();
		provider.submissions = [
			{ kind: 'drawio', title: 'Invalid', source: '<mxfile />' },
			{ kind: 'drawio', title: 'Corrected', source: VALID_DRAWIO_XML }
		];
		const result = await controller.convertInlineMermaid(testActor(), {
			noteId: testNoteId(),
			source: revision.source
		});
		expect(result.suggestion.payload.source).toBe(VALID_DRAWIO_XML);
	});

	it('rejects Mermaid click handlers before offering an inline revision', async () => {
		const { controller, provider } = setup();
		provider.mermaidSource = 'flowchart LR\nA --> B\nclick A "https://example.com"';
		await expect(controller.reviseInlineMermaid(testActor(), revision)).rejects.toThrow(
			'did not submit a valid diagram'
		);
	});
});
