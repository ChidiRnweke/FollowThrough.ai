import { DiagramGenerationRuleService } from '$lib/server/services/diagrams/generation-rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { DiagramGenerationService } from '$lib/server/services/diagrams/generation';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import {
	InMemoryDiagramModel,
	type DiagramCandidate
} from '$lib/testing/diagrams/fakes/in-memory-diagram-model';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';

const setup = (generator?: DiagramGenerationService) => {
	const fixture = diagramGenerationFixture();
	const generation = generator
		? { ...fixture, generation: { ...fixture.generation, generator } }
		: fixture;
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder({ plainText: 'Service A calls Service B' })];
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	const controller = new Diagrams(
		capabilityDependencies<DiagramsDependencies>({
			...agentToolResultsFixture(),
			generationRules: new DiagramGenerationRuleService(),
			selectionOrigins: new InMemorySelectionOrigins(notes, provenance),
			...generation,
			suggestionCreator: suggestions,
			transactionRunner: new InMemoryTransactionRunner([
				notes,
				provenance,
				suggestions,
				generation.persistence,
				generation.conversations
			])
		})
	);
	return { controller, notes, suggestions, conversations: fixture.conversations };
};

const input = {
	selection: {
		noteId: testNoteId(),
		revision: 1,
		from: 0,
		to: 25,
		text: 'Service A calls Service B'
	},
	instruction: 'show dependencies'
};

describe('Generate Mermaid workflow invariants', () => {
	it('returns a Mermaid suggestion rather than mutating a diagram directly', async () => {
		const { controller } = setup();
		const result = await controller.generateMermaid(testActor(), input);
		expect(result.suggestion.kind).toBe('diagram');

		expect(
			result.suggestion.kind === 'diagram' ? result.suggestion.payload.source : undefined
		).toBe('flowchart LR\nA --> B');
	});

	it('rolls back the source anchor when suggestion persistence fails', async () => {
		const { controller, notes, suggestions } = setup();
		suggestions.failCreation = true;
		await controller.generateMermaid(testActor(), input).catch(() => undefined);
		expect(notes.anchors).toEqual([]);
	});
});

/** The production submission protocol over a model that submits each candidate in turn. */
const scripted = (candidates: readonly DiagramCandidate[]): DiagramGenerationService => {
	const model = new InMemoryDiagramModel(candidates);
	return new DiagramGenerationService({
		available: true,
		models: () => new InMemoryModelProvider(model)
	});
};

/**
 * The Diagram Agent's submission tool recovers like every other tool: a mistake reaches the model
 * as feedback and the workflow goes on. Each attempt is journalled in the diagram conversation.
 */
describe('A diagram submission the model gets wrong is corrected, not fatal', () => {
	it('returns the corrected diagram and journals each failed attempt', async () => {
		const { controller, conversations } = setup(
			scripted([
				{ kind: 'raw', format: 'mermaid', arguments: '{"source": "flowchart' },
				{ kind: 'raw', format: 'mermaid', arguments: '{"source": ""}' },
				{ kind: 'mermaid', source: '```mermaid\nflowchart LR\nA --> B\n```' },
				{ kind: 'mermaid', source: 'flowchart LR\nA --> B' }
			])
		);
		const result = await controller.generateMermaid(testActor(), input);
		expect({
			source: result.suggestion.kind === 'diagram' ? result.suggestion.payload.source : undefined,
			attempts: conversations.messages
				.filter((message) => message.role === 'tool')
				.map((message) => message.content.status)
				.filter((status) => status !== 'running')
		}).toEqual({
			source: 'flowchart LR\nA --> B',
			attempts: ['failed', 'reported_failure', 'reported_failure', 'succeeded']
		});
	});
});
