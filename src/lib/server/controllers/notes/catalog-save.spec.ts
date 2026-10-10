import { describe, expect, it } from 'vitest';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { saveNoteDraft } from '$lib/testing/notes/fixtures/saved-draft';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = createNoteServices(notes, anchors, projects);
	return { service, notes, transactionRunner: new InMemoryTransactionRunner([notes]) };
};

describe('Note edits through the real catalog', () => {
	it('rejects a stale save without replacing the note', async () => {
		const { service, notes, transactionRunner } = setup();
		notes.notes = [noteBuilder({ currentRevision: 2 })];
		await expect(
			saveNoteDraft(
				service.editor,
				transactionRunner,
				testActor(),
				noteBuilder({ currentRevision: 1 })
			)
		).rejects.toMatchObject({
			code: 'STALE_REVISION'
		});
	});

	it('does not increment a no-op save', async () => {
		const { service, notes, transactionRunner } = setup();
		notes.notes = [noteBuilder()];
		const saved = await saveNoteDraft(
			service.editor,
			transactionRunner,
			testActor(),
			noteBuilder()
		);
		expect(saved.currentRevision).toBe(1);
	});

	it('increments a meaningful save exactly once', async () => {
		const { service, notes, transactionRunner } = setup();
		notes.notes = [noteBuilder()];
		const saved = await saveNoteDraft(
			service.editor,
			transactionRunner,
			testActor(),
			noteBuilder({ title: 'Changed' })
		);
		expect(saved.currentRevision).toBe(2);
	});

	it('rejects a save that loses the atomic revision race', async () => {
		const { service, notes, transactionRunner } = setup();
		notes.notes = [noteBuilder()];
		notes.failNextConditionalUpdate = true;
		await expect(
			saveNoteDraft(
				service.editor,
				transactionRunner,
				testActor(),
				noteBuilder({ title: 'Changed' })
			)
		).rejects.toMatchObject({
			code: 'STALE_REVISION'
		});
	});

	it('saves even when the client sends stale position', async () => {
		const { service, notes, transactionRunner } = setup();
		notes.notes = [noteBuilder({ position: 0 })];
		const saved = await saveNoteDraft(
			service.editor,
			transactionRunner,
			testActor(),
			noteBuilder({ position: 1 })
		);
		expect(saved).toBeDefined();
	});

	it('rejects authored content in a folder', async () => {
		const { service, notes, transactionRunner } = setup();
		notes.notes = [noteBuilder({ kind: 'folder' })];
		await expect(
			saveNoteDraft(
				service.editor,
				transactionRunner,
				testActor(),
				noteBuilder({ kind: 'folder', plainText: 'content' })
			)
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});
