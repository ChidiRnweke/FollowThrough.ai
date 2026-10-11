import { DrawioDocumentService } from '$lib/server/services/diagrams/drawio';
import { DiagramGenerationRuleService } from '$lib/server/services/diagrams/generation-rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';

const setup = (drawio = false) => {
	const generation = diagramGenerationFixture();
	const diagrams = new InMemoryDiagrams(testActor());
	const suggestions = new InMemorySuggestions(testActor());
	diagrams.diagrams = [drawio ? drawioBuilder() : mermaidBuilder()];
	return {
		diagrams,
		suggestions,
		controller: new Diagrams(
			testActor(),
			capabilityDependencies<DiagramsDependencies>({
				...agentToolResultsFixture(),
				generationRules: new DiagramGenerationRuleService(),
				diagrams: diagrams,
				...generation,
				drawio: new DrawioDocumentService(),
				suggestionCreator: suggestions,
				transactionRunner: new InMemoryTransactionRunner([
					suggestions,
					generation.provenance,
					generation.persistence,
					generation.conversations
				])
			})
		)
	};
};

describe('Promote diagram workflow invariants', () => {
	it('rejects conversion of an existing draw.io diagram', async () => {
		const { controller } = setup(true);
		await expect(controller.promote({ diagramId: drawioBuilder().id })).rejects.toMatchObject({
			code: 'UNSUPPORTED_DIAGRAM_OPERATION'
		});
	});

	it('creates an ordinary draw.io suggestion for explicit review', async () => {
		const { controller, diagrams } = setup();
		const result = await controller.promote({ diagramId: mermaidBuilder().id });
		expect(result.suggestion.kind === 'diagram' ? result.suggestion.payload.kind : undefined).toBe(
			'drawio'
		);
		expect(diagrams.diagrams).toEqual([mermaidBuilder()]);
	});
});
