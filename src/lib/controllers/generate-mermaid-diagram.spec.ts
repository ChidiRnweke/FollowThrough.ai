import { describe, expect, it } from 'vitest';
import { DefaultDiagramsController, type DiagramsDependencies } from './diagrams';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/fakes/in-memory-automation';
import { InMemoryMermaidCreator } from '$lib/testing/fakes/in-memory-diagram-skills';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { noteBuilder, testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder({ plainText: 'Service A calls Service B' })];
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	const controller = new DefaultDiagramsController({
		anchorCreator: notes,
		mermaidCreator: new InMemoryMermaidCreator(),
		provenanceRecorder: provenance,
		suggestionCreator: suggestions,
		transactionRunner: new InMemoryTransactionRunner([notes, provenance, suggestions])
	} as unknown as DiagramsDependencies);
	return { controller, notes, suggestions };
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
	});

	it('preserves the generated Mermaid source in the suggestion', async () => {
		const { controller } = setup();
		const result = await controller.generateMermaid(testActor(), input);
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
