import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteEtag, type NoteRevisionId } from '$lib/models/notes';
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

const revisionIdOf = async (controller: Notes, revision: number): Promise<NoteRevisionId> => {
	const { revisions } = await controller.listRevisions(testActor(), { noteId: testNoteId() });
	return revisions.find((candidate) => candidate.revision === revision)!.id;
};

describe('Reading one note revision as plain text', () => {
	it("returns the snapshot's plain text without the document", async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 1);
		const result = await controller.readRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: await revisionIdOf(controller, 1)
		});
		expect(result.plainText).toBe('Original');
	});

	it('marks the snapshot the note is currently published at', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 1);
		const result = await controller.readRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: await revisionIdOf(controller, 1)
		});
		expect(result.isPublished).toBe(true);
	});

	it('rejects a revision that has been pruned away', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		await expect(
			controller.readRevision(testActor(), {
				noteId: testNoteId(),
				revisionId: `${testNoteId()}:r999` as never
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

describe('Diffing a note revision against a baseline', () => {
	it('diffs against the current published revision by default', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 2);
		const result = await controller.compareRevisions(testActor(), {
			noteId: testNoteId(),
			revisionId: await revisionIdOf(controller, 1)
		});
		expect(result.againstRevision).toBe(2);
	});

	it('reads the patch from the baseline toward the requested version', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 2);
		const result = await controller.compareRevisions(testActor(), {
			noteId: testNoteId(),
			revisionId: await revisionIdOf(controller, 1)
		});
		expect(result.diff.patch).toContain('+Original');
	});

	it('diffs against an explicit baseline when one is given', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		await publishRepeatedly(content, controller, 2);
		const result = await controller.compareRevisions(testActor(), {
			noteId: testNoteId(),
			revisionId: await revisionIdOf(controller, 2),
			againstRevisionId: await revisionIdOf(controller, 1)
		});
		expect(result.againstRevision).toBe(1);
	});

	it('rejects an unknown target revision', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await publishRepeatedly(content, controller, 1);
		await expect(
			controller.compareRevisions(testActor(), {
				noteId: testNoteId(),
				revisionId: `${testNoteId()}:r999` as never
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('rejects the default baseline when the note was never published', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await expect(
			controller.compareRevisions(testActor(), {
				noteId: testNoteId(),
				revisionId: `${testNoteId()}:r1` as never
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
