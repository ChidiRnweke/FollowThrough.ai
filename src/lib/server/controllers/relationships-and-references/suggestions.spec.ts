import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import { describe, expect, it } from 'vitest';
import type { ReferenceCandidate, Url } from '$lib/models/references';
import type { TextSelection } from '$lib/models/notes';
import { References } from '$lib/server/controllers/references/controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import {
	InMemoryProvenanceRecorder,
	InMemoryReferencePipeline
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryWorkflowRunner } from '$lib/testing/agent/fakes/in-memory-workflow-runner';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 9,
	text: 'Use OAuth'
};

const reference = (
	title: string,
	tier: ReferenceCandidate['tier'],
	confidence: number
): ReferenceCandidate => ({
	url: `https://example.com/${title.toLowerCase()}` as Url,
	title,
	tier,
	relevanceNote: `${title} is relevant`,
	confidence
});

const setup = () => {
	const content = new InMemoryNoteContent();
	content.notes = [noteBuilder({ plainText: selection.text })];
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	const references = new InMemoryReferencePipeline();
	const transactionRunner = new InMemoryTransactionRunner([content, provenance, suggestions]);
	return {
		content,
		suggestions,
		provenance,
		references,
		reference: new References({
			selectionOrigins: new InMemorySelectionOrigins(content, provenance),
			referenceFinder: references,
			referenceRanker: references,
			suggestionCreator: suggestions,
			transactionRunner,
			workflowRunner: new InMemoryWorkflowRunner()
		})
	};
};

describe('Reference workflow invariants', () => {
	it('returns an honest empty outcome when search finds nothing', async () => {
		const { reference: controller } = setup();
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(result.outcome).toBe('nothing_relevant');
	});

	it('ranks official sources before community sources', async () => {
		const { references, reference: controller } = setup();
		references.candidates = [reference('Blog', 'community', 99), reference('Spec', 'official', 70)];
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(
			result.outcome === 'found' && result.suggestions[0]?.kind === 'reference'
				? result.suggestions[0].payload.title
				: undefined
		).toBe('Spec');
	});

	it('keeps reference results in proposed state', async () => {
		const { references, reference: controller } = setup();
		references.candidates = [reference('Spec', 'standard', 90)];
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(result.outcome === 'found' ? result.suggestions[0]?.status : undefined).toBe('proposed');
	});

	it('rolls back its anchor when reference suggestion persistence fails', async () => {
		const { content, suggestions, references, reference: controller } = setup();
		references.candidates = [reference('Spec', 'standard', 90)];
		suggestions.failCreation = true;
		try {
			await controller.suggestFromSelection(testActor(), { selection });
		} catch {
			// The restored anchor collection is the invariant under test.
		}
		expect(content.anchors).toEqual([]);
	});
});
