import { describe, it, expect } from 'vitest';
import {
	reviewedNoteFixture,
	requirePreparedChange
} from '$lib/testing/notes/fixtures/reviewed-changes';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';

const baseNote = () =>
	noteBuilder({ ...noteContentFromMarkdown('Launch Monday.'), title: 'Release' });
const setup = async () => {
	const note = baseNote();
	const fixture = reviewedNoteFixture(note);
	const change = requirePreparedChange(
		await fixture.controller.prepareChange(
			testActor(),
			{
				kind: 'patch',
				noteId: note.id,
				edits: [{ oldText: 'Monday', newText: 'Tuesday' }]
			},
			'authored'
		)
	);
	return { ...fixture, note, change };
};

describe('Reviewed note changes', () => {
	it('prepares the exact base and proposed document for review', async () => {
		const { note, change } = await setup();
		expect(change).toMatchObject({
			noteId: note.id,
			base: { revision: 1, document: note.document },
			result: { plainText: 'Launch Tuesday.' },
			operation: { kind: 'patch', appliedEdits: 1 }
		});
	});
	it('saves the prepared document', async () => {
		const { controller, change, content } = await setup();
		await controller.applyReviewedChange(testActor(), change, 'authored');
		expect(content.notes[0].document).toEqual(change.result.document);
	});
	it('refuses to apply after a different edit', async () => {
		const { controller, change, content, note } = await setup();
		content.notes = [{ ...note, ...noteContentFromMarkdown('Launch Friday.'), currentRevision: 2 }];
		expect(await controller.applyReviewedChange(testActor(), change, 'authored')).toMatchObject({
			kind: 'failure',
			code: 'STALE_REVIEW'
		});
	});
	it('leaves the newer content intact after refusing a stale review', async () => {
		const { controller, change, content, note } = await setup();
		content.notes = [{ ...note, ...noteContentFromMarkdown('Launch Friday.'), currentRevision: 2 }];
		await controller.applyReviewedChange(testActor(), change, 'authored');
		expect(content.notes[0].plainText).toBe('Launch Friday.');
	});
	it('reports an already satisfied review as unchanged', async () => {
		const { controller, change } = await setup();
		await controller.applyReviewedChange(testActor(), change, 'authored');
		expect(await controller.applyReviewedChange(testActor(), change, 'authored')).toMatchObject({
			kind: 'unchanged'
		});
	});
	it('does not repeat indexing when the result is already present', async () => {
		const { controller, change, content } = await setup();
		await controller.applyReviewedChange(testActor(), change, 'authored');
		content.failIndex = true;
		expect(await controller.applyReviewedChange(testActor(), change, 'authored')).toMatchObject({
			kind: 'unchanged'
		});
	});
	it('keeps a failed anchor as a preparation failure', async () => {
		const { controller } = reviewedNoteFixture(baseNote());
		expect(
			await controller.prepareChange(
				testActor(),
				{
					kind: 'patch',
					noteId: testNoteId(),
					edits: [{ oldText: 'absent', newText: 'Tuesday' }]
				},
				'authored'
			)
		).toMatchObject({ kind: 'failure' });
	});
	it('does not prepare another account’s note', async () => {
		const { controller } = reviewedNoteFixture(baseNote());
		await expect(
			controller.prepareChange(
				testActor(2),
				{
					kind: 'replace',
					noteId: testNoteId(),
					markdown: 'New'
				},
				'authored'
			)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it('does not apply another account’s review', async () => {
		const { controller, change } = await setup();
		await expect(
			controller.applyReviewedChange(testActor(2), change, 'authored')
		).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
	it('refuses an archived note even if the result matches', async () => {
		const { controller, content, note, change } = await setup();
		content.notes = [{ ...note, ...change.result, archivedAt: testNow }];
		await expect(
			controller.applyReviewedChange(testActor(), change, 'authored')
		).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
	it('reports a target deleted after review', async () => {
		const { controller, content, change } = await setup();
		content.notes = [];
		await expect(
			controller.applyReviewedChange(testActor(), change, 'authored')
		).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
	it('rolls back note, links and indexing when a consequence fails', async () => {
		const { controller, content, note, change } = await setup();
		content.failIndex = true;
		const outcome = await controller.applyReviewedChange(testActor(), change, 'authored').then(
			() => 'saved',
			() => 'failed'
		);
		expect({
			outcome,
			notes: content.notes,
			links: [...content.noteLinkTargets],
			indexed: content.indexedNoteIds
		}).toEqual({ outcome: 'failed', notes: [note], links: [], indexed: [] });
	});
	it('prepares full replacements without publishing', async () => {
		const { controller, content, note } = await setup();
		const change = requirePreparedChange(
			await controller.prepareChange(
				testActor(),
				{
					kind: 'replace',
					noteId: note.id,
					markdown: '# Replacement'
				},
				'authored'
			)
		);
		await controller.applyReviewedChange(testActor(), change, 'authored');
		expect(content.notes[0].publishedRevision).toBe(note.publishedRevision);
	});
});
