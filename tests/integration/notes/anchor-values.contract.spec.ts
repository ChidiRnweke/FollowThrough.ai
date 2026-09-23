import { expect, it } from 'vitest';
import { sourceAnchors } from '$lib/server/db/schema/registry';
import { SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import { anchorBuilder, testAnchorId } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, now, seedNote, replaceNoteFixture } from '../database-harness';

const selectedNote = async (suffix: string) => {
	const state = await seedNote(suffix);
	await replaceNoteFixture({
		...state.note,
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Send' }] }]
		},
		plainText: 'Send'
	});
	return state;
};

it.each([
	{ suffix: '20701', fromOffset: 0, toOffset: null },
	{ suffix: '20702', fromOffset: null, toOffset: 4 },
	{ suffix: '20703', fromOffset: -1, toOffset: 4 }
])('rejects malformed stored anchor offsets: $suffix', async ({ suffix, fromOffset, toOffset }) => {
	const { owner, note } = await seedNote(suffix);
	const id = testAnchorId(Number(suffix));
	// Negative boundary fixture: bypass domain writers to represent malformed external storage.
	await context.db.insert(sourceAnchors).values({
		id,
		noteId: note.id,
		fromOffset,
		toOffset,
		quote: 'Send',
		revision: 1,
		createdAt: new Date(now)
	});
	await expect(new SourceAnchorRecords(context.db).findById(owner, id)).rejects.toThrow();
});

it('preserves both offsets in the synchronized anchor', async () => {
	const { owner, note } = await selectedNote('20704');
	const anchor = await new SourceAnchorRecords(context.db).insert(
		owner,
		anchorBuilder({
			id: testAnchorId(20704),
			noteId: note.id,
			from: 0,
			to: 4
		})
	);
	const result = await new WorkspaceSyncObjects(context.db).read(
		owner,
		{ type: 'source_anchors', id: [anchor.id] },
		null
	);
	if (result.kind !== 'found' || result.snapshot.value.type !== 'source_anchors')
		throw new Error('Anchor is unavailable');
	const value = result.snapshot.value.value;
	expect({ from: value.from, to: value.to, quote: value.quote }).toEqual({
		from: 0,
		to: 4,
		quote: 'Send'
	});
});

it('retains a quote anchor with no recorded range', async () => {
	const { owner, note } = await selectedNote('20705');
	const records = new SourceAnchorRecords(context.db);
	const id = testAnchorId(20705);
	await records.insert(owner, { id, noteId: note.id, quote: 'Send', revision: 1, createdAt: now });
	const value = await records.findById(owner, id);
	expect({ from: value?.from, to: value?.to, quote: value?.quote }).toEqual({
		from: undefined,
		to: undefined,
		quote: 'Send'
	});
});
