import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
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
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = createNoteServices(notes, new InMemoryAnchorRepository(), projects);
	const indexer = new InMemoryNoteContent();
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
			noteTrash: service.trash,
			noteTrashReader: service.trashReader,
			noteIndexer: indexer,
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() }
		})
	);
	return { notes, controller, indexer };
};

describe('Note trash listing invariants', () => {
	it('lists archived notes with project labels while omitting bodies and skills', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder(),
			noteBuilder({ id: testNoteId(2), archivedAt: testNow, plainText: 'Secret body' }),
			noteBuilder({ id: testNoteId(3), kind: 'skill', archivedAt: testNow })
		];
		const result = await controller.listTrash(testActor(), {});
		expect(result.notes).toEqual([
			expect.objectContaining({ id: testNoteId(2), projectName: 'Project Alpha' })
		]);
		expect(result.notes[0]).not.toHaveProperty('plainText');
	});

	it('scopes the listing to one project when asked', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.listTrash(testActor(), { projectId: testProjectId(2) });
		expect(result.notes).toEqual([]);
	});
});
