import { describe, expect, it } from 'vitest';
import { DefaultDiagramsController, type DiagramsDependencies } from './controller';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/fakes/in-memory-diagram-skills';
import { InMemorySuggestions } from '$lib/testing/fakes/in-memory-automation';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { testActor } from '$lib/testing/fixtures/domain-builders';
import { DrawioXmlValidator } from '$lib/server/domain/drawio-content';

const setup = (drawio = false) => {
	const diagrams = new InMemoryDiagrams();
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	diagrams.diagrams = [drawio ? drawioBuilder() : mermaidBuilder()];
	return {
		diagrams,
		suggestions,
		controller: new DefaultDiagramsController({
			diagramFinder: diagrams,
			drawioCreator: diagrams,
			drawioXmlValidator: new DrawioXmlValidator(),
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner: new InMemoryTransactionRunner([suggestions, provenance])
		} as unknown as DiagramsDependencies)
	};
};

describe('Promote diagram workflow invariants', () => {
	it('rejects conversion of an existing draw.io diagram', async () => {
		const { controller } = setup(true);
		await expect(
			controller.promote(testActor(), { diagramId: drawioBuilder().id })
		).rejects.toMatchObject({ code: 'UNSUPPORTED_DIAGRAM_OPERATION' });
	});

	it('creates an ordinary draw.io suggestion for explicit review', async () => {
		const { controller } = setup();
		const result = await controller.promote(testActor(), { diagramId: mermaidBuilder().id });
		expect(result.suggestion.kind === 'diagram' ? result.suggestion.payload.kind : undefined).toBe(
			'drawio'
		);
	});

	it('does not persist a draw.io diagram before acceptance', async () => {
		const { controller, diagrams } = setup();
		await controller.promote(testActor(), { diagramId: mermaidBuilder().id });
		expect(diagrams.diagrams).toEqual([mermaidBuilder()]);
	});
});
