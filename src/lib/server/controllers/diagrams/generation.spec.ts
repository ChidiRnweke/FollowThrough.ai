import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { durableDiagramFixture } from '$lib/testing/diagrams/fixtures/durable-generation';

const setup = () => {
	const fixture = diagramGenerationFixture();
	const suggestions = new InMemorySuggestions();
	const controller = new Diagrams(
		capabilityDependencies<DiagramsDependencies>({
			...fixture,
			drawioXmlValidator: new DrawioXmlValidator(),
			suggestionCreator: suggestions,
			transactionRunner: new InMemoryTransactionRunner([
				suggestions,
				fixture.persistence,
				fixture.conversations
			])
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
	it('keeps a cancelled direct run from publishing a late diagram', async () => {
		const state = durableDiagramFixture();
		const gate = Promise.withResolvers<void>();
		state.provider.completion = gate.promise;
		const execution = state.controller
			.convertInlineMermaid(testActor(), { noteId: testNoteId(), source: revision.source })
			.catch((error) => {
				if (!(error instanceof Error) || error.message !== 'The workflow run is no longer running')
					throw error;
				return { kind: 'failure' as const };
			});
		try {
			await state.provider.started.promise;
			await state.agent.cancel(testActor(), state.persistence.runs[0].id);
		} finally {
			gate.resolve();
		}
		await execution;
		expect({
			status: state.persistence.runs[0].status,
			suggestions: state.suggestions.suggestions
		}).toEqual({ status: 'cancelled', suggestions: [] });
	});

	it('preserves the provider failure when cancellation has already settled the direct run', async () => {
		const state = durableDiagramFixture();
		const gate = Promise.withResolvers<void>();
		state.provider.completion = gate.promise;
		state.provider.failure = new Error('Provider disconnected');
		const execution = state.controller.reviseInlineMermaid(testActor(), revision).catch((error) => {
			if (!(error instanceof Error)) throw error;
			return { kind: 'failure' as const, message: error.message };
		});
		try {
			await state.provider.started.promise;
			await state.agent.cancel(testActor(), state.persistence.runs[0].id);
		} finally {
			gate.resolve();
		}
		expect(await execution).toEqual({ kind: 'failure', message: 'Provider disconnected' });
	});
	it('does not leave a conversation when model lookup fails before generation', async () => {
		const { controller, conversations, models } = setup();
		models.failure = new Error('Catalog unavailable');
		await controller.reviseInlineMermaid(testActor(), revision).catch((error) => {
			if (!(error instanceof Error) || error.message !== 'Catalog unavailable') throw error;
			return { kind: 'failure' as const };
		});
		expect(conversations.conversations).toEqual([]);
	});

	it('records the start and finish times of a completed direct run', async () => {
		const { controller, persistence } = setup();
		await controller.reviseInlineMermaid(testActor(), revision);
		expect(
			persistence.runs.map((run) => ({ startedAt: run.startedAt, finishedAt: run.finishedAt }))
		).toEqual([{ startedAt: testNow, finishedAt: testNow }]);
	});
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
