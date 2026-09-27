import { expect, it } from 'vitest';
import { NoteHistory } from './history.svelte';
import type { NoteRevision, NoteRevisionId, NoteRevisionSummary } from '$lib/models/notes';
import { testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const revision = (value: number): NoteRevision => ({
	id: `70000000-0000-4000-8000-${String(value).padStart(12, '0')}` as NoteRevisionId,
	noteId: testNoteId(),
	revision: value,
	title: `Version ${value}`,
	document: { type: 'doc', content: [] },
	plainText: '',
	createdAt: testNow
});
it('keeps the latest selected revision when an earlier read finishes later', async () => {
	const earlier = revision(1),
		latest = revision(2);
	const delayed = Promise.withResolvers<NoteRevision>();
	const history = new NoteHistory(
		testNoteId(),
		async () => [],
		async (_noteId, id) => (id === earlier.id ? delayed.promise : latest)
	);
	const first = history.select(earlier.id);
	await history.select(latest.id);
	delayed.resolve(earlier);
	await first;
	expect({ selectedId: history.selectedId, selected: history.selected?.id }).toEqual({
		selectedId: latest.id,
		selected: latest.id
	});
});
it('keeps a newer successful selection when an earlier read fails later', async () => {
	const earlier = revision(1),
		latest = revision(2);
	const delayed = Promise.withResolvers<NoteRevision>();
	const history = new NoteHistory(
		testNoteId(),
		async () => [],
		async (_noteId, id) => (id === earlier.id ? delayed.promise : latest)
	);
	const first = history.select(earlier.id);
	await history.select(latest.id);
	delayed.reject(new Error('Earlier request failed'));
	await first;
	expect({ state: history.readState, selected: history.selected?.id }).toEqual({
		state: { kind: 'ready' },
		selected: latest.id
	});
});

const summary = (value: number, isPublished = false): NoteRevisionSummary => ({
	...revision(value),
	isPublished
});
it('keeps the newer history list when a previous opening finishes later', async () => {
	const delayed = Promise.withResolvers<readonly NoteRevisionSummary[]>();
	let opening = 0;
	const history = new NoteHistory(
		testNoteId(),
		async () => (++opening === 1 ? delayed.promise : [summary(2)]),
		async () => revision(2)
	);
	const first = history.open();
	await history.open();
	delayed.resolve([summary(1)]);
	await first;
	expect(history.revisions.map((item) => item.id)).toEqual([revision(2).id]);
});
it('does not adopt a selected revision after history is closed', async () => {
	const delayed = Promise.withResolvers<NoteRevision>();
	const history = new NoteHistory(
		testNoteId(),
		async () => [],
		async () => delayed.promise
	);
	const reading = history.select(revision(1).id);
	history.cancel();
	delayed.resolve(revision(1));
	await reading;
	expect(history.selected).toBeUndefined();
});
it('prefers the published snapshot when a newer snapshot exists', async () => {
	const history = new NoteHistory(
		testNoteId(),
		async () => [summary(2), summary(1, true)],
		async (_noteId, id) => (id === revision(1).id ? revision(1) : revision(2))
	);
	await history.open();
	expect(history.selected?.id).toBe(revision(1).id);
});
it('uses the newest snapshot when no revision is marked published', async () => {
	const history = new NoteHistory(
		testNoteId(),
		async () => [summary(2), summary(1)],
		async () => revision(2)
	);
	await history.open();
	expect(history.selectedId).toBe(revision(2).id);
});
it('distinguishes a failed list request from an empty result', async () => {
	const history = new NoteHistory(
		testNoteId(),
		async () => {
			throw new Error('Unavailable');
		},
		async () => revision(1)
	);
	await history.open();
	expect(history.readState.kind).toBe('failure');
});
it('accepts a successful empty history without selecting a version', async () => {
	const history = new NoteHistory(
		testNoteId(),
		async () => [],
		async () => revision(1)
	);
	await history.open();
	expect({
		state: history.readState,
		selected: history.selected,
		revisions: history.revisions
	}).toEqual({ state: { kind: 'ready' }, selected: undefined, revisions: [] });
});
it('clears a previously selected snapshot when reopening starts', async () => {
	const delayed = Promise.withResolvers<readonly NoteRevisionSummary[]>();
	const history = new NoteHistory(
		testNoteId(),
		async () => delayed.promise,
		async () => revision(1)
	);
	await history.select(revision(1).id);
	const loading = history.open();
	const selectedWhileLoading = history.selected;
	delayed.resolve([]);
	await loading;
	expect(selectedWhileLoading).toBeUndefined();
});
