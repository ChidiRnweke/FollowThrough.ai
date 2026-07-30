import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import { InMemorySuggestions } from '$lib/testing/fakes/in-memory-automation';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { testActor, testNoteId, testProvenanceId } from '$lib/testing/fixtures/domain-builders';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/fixtures/drawio';
import type { InlineMermaidToDrawioConverter } from '$lib/server/services';

class FakeDrawioConverter implements InlineMermaidToDrawioConverter {
	source = VALID_DRAWIO_XML;

	async convertInline() {
		return {
			title: 'Converted architecture',
			source: this.source,
			provenanceId: testProvenanceId(2)
		};
	}
}

const setup = () => {
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	const converter = new FakeDrawioConverter();
	const controller = new Diagrams({
		inlineMermaidToDrawioConverter: converter,
		drawioXmlValidator: new DrawioXmlValidator(),
		provenanceRecorder: provenance,
		suggestionCreator: suggestions,
		transactionRunner: new InMemoryTransactionRunner([suggestions, provenance])
	} as unknown as DiagramsDependencies);
	return { controller, converter, suggestions };
};

const input = { noteId: testNoteId(), source: 'mindmap\n  Root\n    Child' };

describe('Inline Mermaid conversion invariants', () => {
	it('creates an ordinary draw.io suggestion', async () => {
		const { controller } = setup();
		const result = await controller.convertInlineMermaid(testActor(), input);
		expect(result.suggestion.kind === 'diagram' ? result.suggestion.payload.kind : undefined).toBe(
			'drawio'
		);
	});

	it('preserves the agent generated XML directly', async () => {
		const { controller } = setup();
		const result = await controller.convertInlineMermaid(testActor(), input);
		expect(
			result.suggestion.kind === 'diagram' ? result.suggestion.payload.source : undefined
		).toBe(VALID_DRAWIO_XML);
	});

	it('records the fresh agent provenance on the suggestion', async () => {
		const { controller } = setup();
		const result = await controller.convertInlineMermaid(testActor(), input);
		expect(result.suggestion.provenanceId).toBe(testProvenanceId(2));
	});

	it('does not persist a suggestion after terminal XML validation failure', async () => {
		const { controller, converter, suggestions } = setup();
		converter.source = '<mxfile />';
		await controller.convertInlineMermaid(testActor(), input).catch(() => undefined);
		expect(suggestions.suggestions).toEqual([]);
	});
});
