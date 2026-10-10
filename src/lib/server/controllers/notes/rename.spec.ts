import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const content = new InMemoryNoteContent();
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
			noteReader: content,
			noteEditor: content,
			noteLinkReconciler: content,
			revisionRecorder: content,
			noteIndexer: content,
			transactionRunner: new InMemoryTransactionRunner([content])
		})
	);
	return { content, controller };
};

describe('Note rename invariants', () => {
	it('renames the note', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		const result = await controller.rename(testActor(), {
			noteId: testNoteId(),
			title: 'Renamed'
		});
		expect(result.note.title).toBe('Renamed');

		expect(result.note.currentRevision).toBe(2);
		expect(content.recordedRevisions).toEqual([]);
	});

	// A rename is not a publication. History is capped, so letting title edits take slots
	// would quietly evict body snapshots the reader may still want back.

	it('rejects an empty title', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await expect(
			controller.rename(testActor(), { noteId: testNoteId(), title: '   ' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects renaming a note that does not exist', async () => {
		const { controller } = setup();
		await expect(
			controller.rename(testActor(), { noteId: testNoteId(9), title: 'Renamed' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
