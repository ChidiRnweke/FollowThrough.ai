import { describe, expect, it } from 'vitest';
import type { ReferenceCandidate, TextSelection, Url } from '$lib/models';
import { DefaultRelationshipsController } from './relationships';
import { DefaultReferencesController } from './references';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/fakes/in-memory-automation';
import {
	InMemoryLinkFinder,
	InMemoryProvenanceRecorder,
	InMemoryReferencePipeline
} from '$lib/testing/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { noteBuilder, testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';

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
	const links = new InMemoryLinkFinder();
	const references = new InMemoryReferencePipeline();
	const transactionRunner = new InMemoryTransactionRunner([content, provenance, suggestions]);
	return {
		content,
		suggestions,
		provenance,
		links,
		references,
		relate: new DefaultRelationshipsController({
			anchorCreator: content,
			linkFinder: links,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner
		}),
		reference: new DefaultReferencesController({
			anchorCreator: content,
			referenceFinder: references,
			referenceRanker: references,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner
		})
	};
};

describe('Relate workflow invariants', () => {
	it('creates one backlink suggestion per related note', async () => {
		const { links, relate } = setup();
		links.candidates = [
			{
				targetNoteId: testNoteId(2),
				kind: 'contradicts',
				justification: 'Opposite decision',
				confidence: 90
			}
		];
		const result = await relate.suggestFromSelection(testActor(), { selection });
		expect(result.suggestions).toHaveLength(1);
	});

	it('preserves the semantic relationship label', async () => {
		const { links, relate } = setup();
		links.candidates = [
			{
				targetNoteId: testNoteId(2),
				kind: 'prior_decision',
				justification: 'Earlier decision',
				confidence: 88
			}
		];
		const result = await relate.suggestFromSelection(testActor(), { selection });
		expect(result.suggestions[0]?.kind === 'backlink' && result.suggestions[0].payload.kind).toBe(
			'prior_decision'
		);
	});

	it('returns no suggestions when retrieval finds no relationship', async () => {
		const { relate } = setup();
		const result = await relate.suggestFromSelection(testActor(), { selection });
		expect(result.suggestions).toEqual([]);
	});

	it('rolls back its anchor when suggestion persistence fails', async () => {
		const { content, suggestions, links, relate } = setup();
		links.candidates = [
			{
				targetNoteId: testNoteId(2),
				kind: 'mentions',
				justification: 'Related subject',
				confidence: 70
			}
		];
		suggestions.failCreation = true;
		try {
			await relate.suggestFromSelection(testActor(), { selection });
		} catch {
			// The restored anchor collection is the invariant under test.
		}
		expect(content.anchors).toEqual([]);
	});
});

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
