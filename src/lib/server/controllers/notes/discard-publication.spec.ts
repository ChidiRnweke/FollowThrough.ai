import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { expect, it } from 'vitest';
import type { Note } from '$lib/models/notes';
const content = (text: string): Pick<Note, 'plainText' | 'document'> => ({
	plainText: text,
	document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
});
import { Notes, type NotesDependencies } from './controller';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { noteEtag } from '$lib/services/notes/presentation';
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
	const catalog = new NoteCatalog(records, new InMemoryAnchorRepository(), projects);
	const effects = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner: new InMemoryTransactionRunner([records, effects]),
			noteReader: catalog,
			noteEditor: catalog,
			notePublisher: catalog,
			revisionRecorder: catalog,
			revisionReader: catalog,
			attachmentRestorer: catalog,
			anchorRepairer: catalog,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
	const original = noteBuilder(content('First publication'));
	records.notes = [original];
	const first = await controller.publish(testActor(), {
		noteId: original.id,
		baseEtag: noteEtag(original)
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
			baseEtag: noteEtag(draft)
		});
		paused.release();
		expect((await discarding).note).toEqual(latest.note);
	} finally {
		paused.release();
	}
});
