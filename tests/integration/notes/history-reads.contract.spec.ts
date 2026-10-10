import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { expect, it } from 'vitest';
import { createAgentFilesCapability } from '$lib/server/factories/capabilities/agent-files-capability-factory';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
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
	await controller.publish(seed.owner, {
		noteId: seed.note.id,
		baseEtag: noteEtag(second.note.id, second.note.currentRevision)
	});
	const { revisions } = await controller.listRevisions(seed.owner, { noteId: seed.note.id });
	return { ...seed, controller, revisions };
};
it('lists published snapshots newest first with the current publication marked', async () => {
	const { revisions } = await setup('28001');
	expect(revisions.map(({ title, isPublished }) => ({ title, isPublished }))).toEqual([
		{ title: 'Second publication', isPublished: true },
		{ title: 'First publication', isPublished: false }
	]);
});
it('reads the selected old snapshot instead of the current body', async () => {
	const { controller, owner, note, revisions } = await setup('28002');
	const selected = revisions[1]!;
	const { revision } = await controller.getRevision(owner, {
		noteId: note.id,
		revisionId: selected.id
	});
	expect(revision).toMatchObject({
		id: selected.id,
		noteId: note.id,
		...content('First publication')
	});
});
it('does not expose a revision to another established account', async () => {
	const { controller, note, revisions } = await setup('28003');
	const foreign = await seedNote('28004');
	await expect(
		controller.getRevision(foreign.owner, { noteId: note.id, revisionId: revisions[0]!.id })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('does not read a snapshot through a different note owned by the same account', async () => {
	const { controller, owner, revisions } = await setup('28005');
	const other = await seedNote('28006', owner);
	await expect(
		controller.getRevision(owner, { noteId: other.note.id, revisionId: revisions[0]!.id })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('makes stored history unavailable when its project is archived', async () => {
	const { controller, owner, note, project, revisions } = await setup('28007');
	await new ProjectRecords(context.db).archive(owner, project.id);
	await expect(
		controller.getRevision(owner, { noteId: note.id, revisionId: revisions[0]!.id })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('reads the old publication from the agent version path', async () => {
	const { owner, note, project, revisions } = await setup('28008');
	const { reader } = createAgentFilesCapability({
		tokens: testTokenizer,
		db: context.db,
		projects: new ProjectRecords(context.db),
		notes: new NoteRecords(context.db)
	});
	expect(
		await reader.sed(
			owner,
			`/projects/${project.id}/notes/${note.id}/versions/${revisions[1]!.revision}.md`,
			{ kind: 'to_end', startLine: 1 }
		)
	).toMatchObject({ kind: 'content', content: 'First publication' });
});
