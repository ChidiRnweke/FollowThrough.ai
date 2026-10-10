import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { expect, it } from 'vitest';
import type { Note } from '$lib/models/notes';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteEtag } from '$lib/models/notes';
import { context, seedNote } from '../database-harness';

const content = (text: string): Pick<Note, 'title' | 'plainText' | 'document'> => ({
	title: text,
	plainText: text,
	document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
});
const setup = async (suffix: string) => {
	const seed = await seedNote(suffix);
	const tx = createTransactionContext(context.db);
	const { services: catalog } = createNotesCapability({
		db: tx.database,
		projects: new ProjectRecords(tx.database)
	});
	const effects = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			patchPreparation: new NotePatchPreparationService(),
			revisionComparison: new NoteRevisionComparisonService(),
			todoPresentation: new TodoPresentationService(),
			textSearch: new NoteTextSearchService(),
			noteReferences: new NoteReferenceService(),
			sections: new NoteSectionNumberingService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner: tx.transactionRunner,
			noteReader: catalog.reader,
			noteEditor: catalog.editor,
			notePublisher: catalog.publisher,
			revisionRecorder: catalog.revisionRecorder,
			revisionReader: catalog.revisionReader,
			anchorRepairer: catalog.anchorRepairer,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
	const first = await controller.save(seed.owner, {
		note: { ...seed.note, ...content('First publication') }
	});
	const published = await controller.publish(seed.owner, {
		noteId: seed.note.id,
		baseEtag: noteEtag(first.note.id, first.note.currentRevision)
	});
	const second = await controller.save(seed.owner, {
		note: { ...published.note, ...content('Second publication') }
	});
	const latest = await controller.publish(seed.owner, {
		noteId: seed.note.id,
		baseEtag: noteEtag(second.note.id, second.note.currentRevision)
	});
	const { revisions } = await controller.listRevisions(seed.owner, { noteId: seed.note.id });
	return { ...seed, note: latest.note, controller, revisions };
};
it('compares the requested snapshot against publication instead of the working draft', async () => {
	const { controller, owner, note, revisions } = await setup('30001');
	await controller.save(owner, { note: { ...note, ...content('Unpublished draft') } });
	expect(
		await controller.compareRevisions(owner, { noteId: note.id, revisionId: revisions[1]!.id })
	).toMatchObject({
		againstRevision: revisions[0]!.revision,
		diff: {
			addedLines: 1,
			removedLines: 1,
			patch: expect.stringContaining('title: Second publication → First publication')
		}
	});
});
it('compares in the explicit baseline-to-target direction', async () => {
	const { controller, owner, note, revisions } = await setup('30002');
	expect(
		await controller.compareRevisions(owner, {
			noteId: note.id,
			revisionId: revisions[0]!.id,
			againstRevisionId: revisions[1]!.id
		})
	).toMatchObject({
		againstRevision: revisions[1]!.revision,
		diff: { patch: expect.stringContaining('+Second publication') }
	});
});
it('rejects an explicit baseline belonging to another note of the same account', async () => {
	const { controller, owner, note, revisions } = await setup('30003');
	const other = await seedNote('30004', owner);
	const published = await controller.publish(owner, {
		noteId: other.note.id,
		baseEtag: noteEtag(other.note.id, other.note.currentRevision)
	});
	const { revisions: foreign } = await controller.listRevisions(owner, {
		noteId: published.note.id
	});
	await expect(
		controller.compareRevisions(owner, {
			noteId: note.id,
			revisionId: revisions[0]!.id,
			againstRevisionId: foreign[0]!.id
		})
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('rejects comparison by another established account', async () => {
	const { controller, note, revisions } = await setup('30005');
	const foreign = await seedNote('30006');
	await expect(
		controller.compareRevisions(foreign.owner, {
			noteId: note.id,
			revisionId: revisions[0]!.id,
			againstRevisionId: revisions[1]!.id
		})
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
