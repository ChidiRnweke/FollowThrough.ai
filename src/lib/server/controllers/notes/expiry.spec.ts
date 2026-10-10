import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('reports expiry failure before presenting a note’s pending proposals', async () => {
	const proposals = new InMemorySuggestionReader();
	proposals.expiryFailure = new Error('Expiry storage is unavailable');
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionExpirer: proposals
		})
	);
	await expect(controller.get(testActor(), { noteId: testNoteId() })).rejects.toThrow(
		'Expiry storage is unavailable'
	);
});
