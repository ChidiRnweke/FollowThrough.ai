import { DiagramGenerationRuleService } from '$lib/server/services/diagrams/generation-rules';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testNoteId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const setup = () => {
	const suggestions = new InMemorySuggestions();
	const generation = diagramGenerationFixture();
	const converter = generation.provider;
	const controller = new Diagrams(
		capabilityDependencies<DiagramsDependencies>({
			generationRules: new DiagramGenerationRuleService(),
			...generation,
			drawioXmlValidator: new DrawioXmlValidator(),
			suggestionCreator: suggestions,
			transactionRunner: new InMemoryTransactionRunner([
				suggestions,
				generation.provenance,
				generation.persistence,
				generation.conversations
			])
		})
	);
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

		expect(result.suggestion.provenanceId).toBe(testProvenanceId(1));

		expect(
			result.suggestion.kind === 'diagram' ? result.suggestion.payload.source : undefined
		).toBe(VALID_DRAWIO_XML);
	});

	it('does not persist a suggestion after terminal XML validation failure', async () => {
		const { controller, converter, suggestions } = setup();
		converter.source = '<mxfile />';
		await controller.convertInlineMermaid(testActor(), input).catch(() => undefined);
		expect(suggestions.suggestions).toEqual([]);
	});
});
