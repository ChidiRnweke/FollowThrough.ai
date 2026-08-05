import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteVersionHistory from './note-version-history.svelte';
import type { Note, NoteId, NoteRevision, NoteRevisionSummary } from '$lib/models/notes';

const noteId = '20000000-0000-4000-8000-000000000001' as NoteId;
const revisionId = '70000000-0000-4000-8000-000000000001' as NoteRevision['id'];

const note: Pick<Note, 'title' | 'plainText' | 'publishedRevision' | 'currentRevision'> = {
	title: 'Architecture note',
	plainText: 'The rewritten body',
	publishedRevision: 2,
	currentRevision: 4
};

const summary: NoteRevisionSummary = {
	id: revisionId,
	revision: 2,
	title: 'Architecture note',
	createdAt: '2026-07-12T08:00:00.000Z' as NoteRevisionSummary['createdAt'],
	isPublished: true
};

const revision: NoteRevision = {
	id: revisionId,
	noteId,
	revision: 2,
	title: 'Architecture note',
	document: { type: 'doc', content: [] },
	plainText: 'The original body',
	createdAt: '2026-07-12T08:00:00.000Z' as NoteRevision['createdAt']
};

const base = {
	open: true,
	note,
	revisions: [summary],
	onselect: () => undefined,
	onrestore: async () => undefined
};

describe('NoteVersionHistory', () => {
	it('lists each version', async () => {
		const screen = await render(NoteVersionHistory, base);
		expect(await screen.getByText(/Version 2/).all()).not.toHaveLength(0);
	});

	it('marks the version the note is published at', async () => {
		const screen = await render(NoteVersionHistory, base);
		expect(await screen.getByText('Published').all()).not.toHaveLength(0);
	});

	it('asks for a version’s body when one is picked', async () => {
		const picked: NoteRevision['id'][] = [];
		const screen = await render(NoteVersionHistory, {
			...base,
			onselect: (id: NoteRevision['id']) => {
				picked.push(id);
			}
		});
		await screen.getByRole('button', { name: /Version 2/ }).click();
		expect(picked).toEqual([revisionId]);
	});

	it('diffs the selected version against the note as it stands', async () => {
		const screen = await render(NoteVersionHistory, { ...base, selected: revision });
		expect(await screen.getByText(/The rewritten body/).all()).not.toHaveLength(0);
	});

	// Nothing to compare against until a version is chosen, and an empty diff pane
	// reads as "no changes" rather than "nothing picked".
	it('withholds the restore action until a version is selected', async () => {
		const screen = await render(NoteVersionHistory, base);
		expect(await screen.getByRole('button', { name: 'Restore this version' }).all()).toHaveLength(
			0
		);
	});

	it('offers to restore the selected version', async () => {
		const screen = await render(NoteVersionHistory, { ...base, selected: revision });
		expect(
			await screen.getByRole('button', { name: 'Restore this version' }).all()
		).not.toHaveLength(0);
	});

	it('explains that a note with no history has never been published', async () => {
		const screen = await render(NoteVersionHistory, { ...base, revisions: [] });
		expect(await screen.getByText('No versions yet').all()).not.toHaveLength(0);
	});
});
