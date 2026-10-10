import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { expect, it } from 'vitest';
import type { Note } from '$lib/models/notes';
const content = (text: string): Pick<Note, 'plainText' | 'document'> => ({
	plainText: text,
	document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
});
import { Notes, type NotesDependencies } from './controller';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { noteEtag } from '$lib/models/notes';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor
} from '$lib/testing/workspace/fixtures/domain-builders';

it('discards against the publication that committed before it acquired the note', async () => {
	const records = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(records);
	projects.projects = [projectBuilder()];
	const catalog = createNoteServices(records, new InMemoryAnchorRepository(), projects);
	const effects = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner: new InMemoryTransactionRunner([records, effects]),
			noteReader: catalog.reader,
			noteEditor: catalog.editor,
			notePublisher: catalog.publisher,
			revisionRecorder: catalog.revisionRecorder,
			revisionReader: catalog.revisionReader,
			attachmentRestorer: catalog.attachmentRestorer,
			anchorRepairer: catalog.anchorRepairer,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
	const original = noteBuilder(content('First publication'));
	records.notes = [original];
	const first = await controller.publish(testActor(), {
		noteId: original.id,
		baseEtag: noteEtag(original.id, original.currentRevision)
	});
	const { note: draft } = await controller.save(testActor(), {
		note: { ...first.note, ...content('New publication') }
	});
	const paused = records.pauseNextWriteRead();
	const discarding = controller.discardDraft(testActor(), { noteId: original.id });
	await paused.started;
	try {
		const latest = await controller.publish(testActor(), {
			noteId: draft.id,
			baseEtag: noteEtag(draft.id, draft.currentRevision)
		});
		paused.release();
		expect((await discarding).note).toEqual(latest.note);
	} finally {
		paused.release();
	}
});
