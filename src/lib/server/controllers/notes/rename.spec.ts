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
	});

	it('increments the revision on rename', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		const result = await controller.rename(testActor(), {
			noteId: testNoteId(),
			title: 'Renamed'
		});
		expect(result.note.currentRevision).toBe(2);
	});

	it('records a revision snapshot on rename', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await controller.rename(testActor(), { noteId: testNoteId(), title: 'Renamed' });
		expect(content.revisions.map((revision) => revision.title)).toEqual(['Renamed']);
	});

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
