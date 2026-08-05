import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { NOTE_REVISION_HISTORY_LIMIT, noteEtag } from '$lib/models/notes';
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
			notePublisher: content,
			revisionRecorder: content,
			revisionReader: content,
			anchorRepairer: content,
			noteIndexer: content,
			transactionRunner: new InMemoryTransactionRunner([content])
		})
	);
	return { content, controller };
};

/** Publishes `times` times, editing between each so a new revision is worth recording. */
const publishRepeatedly = async (
	content: InMemoryNoteContent,
	controller: Notes,
	times: number
): Promise<void> => {
	for (let round = 0; round < times; round += 1) {
		const current = content.notes[0]!;
		await controller.publish(testActor(), {
			noteId: current.id,
			baseEtag: noteEtag(current)
		});
		await controller.save(testActor(), {
			note: { ...content.notes[0]!, plainText: `Body ${round}` }
		});
	}
};

describe('Note revision history invariants', () => {
	it('lists nothing before the note has ever been published', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions).toEqual([]);
	});

	it('lists a snapshot once the note is published', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions).toHaveLength(1);
	});

	it('orders the history newest first', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 3);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions.map((revision) => revision.revision)).toEqual([3, 2, 1]);
	});

	it('marks the snapshot the note is currently published at', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 2);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions.filter((revision) => revision.isPublished)).toHaveLength(1);
	});

	// The whole point of snapshotting at publish rather than per keystroke is that history
	// costs a bounded amount; without the cap a long-lived note grows without limit.
	it('caps the history at the retention limit', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, NOTE_REVISION_HISTORY_LIMIT + 5);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions).toHaveLength(NOTE_REVISION_HISTORY_LIMIT);
	});

	it('evicts the oldest snapshots first', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, NOTE_REVISION_HISTORY_LIMIT + 5);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		// 25 publications, 20 kept: revisions 1–5 are gone and 6 is the oldest survivor.
		expect(result.revisions.at(-1)?.revision).toBe(6);
	});

	it('omits the document body from the history list', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		const result = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(result.revisions[0]).not.toHaveProperty('document');
	});

	it('reads one snapshot in full for the diff', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 1);
		const { revisions } = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		const result = await controller.getRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revisions[0]!.id
		});
		expect(result.revision.plainText).toBe('Original');
	});

	it('rejects reading a revision that has been pruned away', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		await expect(
			controller.getRevision(testActor(), {
				noteId: testNoteId(),
				revisionId: `${testNoteId()}:r999` as never
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
