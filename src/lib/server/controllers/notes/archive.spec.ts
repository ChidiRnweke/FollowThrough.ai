import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { NoteArchiveImportService } from '$lib/server/services/notes/import';
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
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteTrashWrite } from '$lib/testing/workspace/fixtures/commands';
import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = createNoteServices(notes, new InMemoryAnchorRepository(), projects);
	const indexer = new InMemoryNoteContent();
	const controller = new Notes(
		new BacklinkPresentationService(),
		new ReferencePresentationService(),
		new WorkspaceCommandRulesService(),
		new ProvenancePresentationService(),
		capabilityDependencies<NotesDependencies>({
			archiveImport: new NoteArchiveImportService(),
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
			noteTrash: service.trash,
			noteIndexer: indexer,
			transactionRunner: new InMemoryTransactionRunner([notes, indexer])
		})
	);
	return { notes, controller, indexer };
};
describe('Note archive invariants', () => {
	it('rolls back the archive when indexing fails', async () => {
		const { notes, controller, indexer } = setup();
		const original = noteBuilder();
		notes.notes = [original];
		indexer.failIndex = true;
		const outcome = await controller.archive(testActor(), { noteId: original.id }).then(
			() => ({ kind: 'success' }),
			() => ({ kind: 'failure', notes: notes.notes })
		);
		expect(outcome).toEqual({ kind: 'failure', notes: [original] });
	});
	it('uses the same resolved note as the offline archive command', async () => {
		const { notes, controller } = setup();
		const original = noteBuilder();
		notes.notes = [original];
		const { note } = await controller.archive(testActor(), { noteId: original.id });
		expect((await noteTrashWrite(original, 'archive', [original], note.updatedAt)).local).toEqual({
			type: 'notes',
			value: note
		});
	});
	it('archives the note through the controller', async () => {
		const { notes, controller, indexer } = setup();
		notes.notes = [noteBuilder()];
		const result = await controller.archive(testActor(), { noteId: testNoteId() });
		expect(result.note.archivedAt).toBeDefined();
		expect(await notes.listActive(testActor())).toEqual([]);
		expect(indexer.indexedNoteIds).toEqual([testNoteId()]);
	});
	it('rejects archiving a folder with active contents', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId() })
		];
		await expect(controller.archive(testActor(), { noteId: testNoteId() })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});
it('rejects archiving a note that is already archived', async () => {
	const { notes, controller } = setup();
	notes.notes = [noteBuilder({ archivedAt: testNow })];
	await expect(controller.archive(testActor(), { noteId: testNoteId() })).rejects.toMatchObject({
		code: 'VALIDATION'
	});
});
it('archives a folder whose contents are all archived', async () => {
	const { notes, controller } = setup();
	notes.notes = [
		noteBuilder({ kind: 'folder' }),
		noteBuilder({ id: testNoteId(2), parentId: testNoteId(), archivedAt: testNow })
	];
	const result = await controller.archive(testActor(), { noteId: testNoteId() });
	expect(result.note.archivedAt).toBeDefined();
});
it('does not expose another user’s note through archive', async () => {
	const { notes, controller } = setup();
	notes.notes = [noteBuilder()];
	await expect(controller.archive(testActor(2), { noteId: testNoteId() })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
