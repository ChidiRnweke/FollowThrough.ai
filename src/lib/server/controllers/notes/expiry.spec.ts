import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
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
			noteReferences: new NoteReferenceService(),
			sections: new NoteSectionNumberingService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionExpirer: proposals
		})
	);
	await expect(controller.get(testActor(), { noteId: testNoteId() })).rejects.toThrow(
		'Expiry storage is unavailable'
	);
});
