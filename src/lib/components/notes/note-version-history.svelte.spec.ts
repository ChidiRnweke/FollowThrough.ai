import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteVersionHistory from './note-version-history.svelte';
import type { Note, NoteId, NoteRevision, NoteRevisionSummary } from '$lib/models/notes';
import { formatRelativeTime } from '$lib/components/shared/labels';

const noteId = '20000000-0000-4000-8000-000000000001' as NoteId;
const revisionId = '70000000-0000-4000-8000-000000000001' as NoteRevision['id'];

const note: Pick<
	Note,
	'title' | 'plainText' | 'document' | 'publishedRevision' | 'currentRevision'
> = {
	title: 'Architecture note',
	plainText: 'The rewritten body',
	document: {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The rewritten body' }] }]
	},
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
	document: {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The original body' }] }]
	},
	plainText: 'The original body',
	createdAt: '2026-07-12T08:00:00.000Z' as NoteRevision['createdAt']
};

const base = {
	open: true,
	note,
	revisions: [summary],
	onselect: () => undefined,
	onrestore: async () => true
};

describe('NoteVersionHistory', () => {
	// The dialog belongs to one note, so a row identifies its revision by when the
	// snapshot was taken — a version number named nothing the reader could act on.
	it('lists each version by when it was taken', async () => {
		const screen = await render(NoteVersionHistory, base);
		expect(await screen.getByText(formatRelativeTime(summary.createdAt)).all()).not.toHaveLength(0);
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
		await screen
			.getByRole('button', { name: new RegExp(formatRelativeTime(summary.createdAt)) })
			.click();
		expect(picked).toEqual([revisionId]);
	});

	it('diffs the selected version against the note as it stands', async () => {
		await render(NoteVersionHistory, { ...base, selected: revision });
		await expect
			.poll(async () => ({
				previous: document.querySelector('[aria-label="Read-only preview of Previous"]')
					?.textContent,
				current: document.querySelector('[aria-label="Read-only preview of Current draft"]')
					?.textContent
			}))
			.toEqual({
				previous: expect.stringContaining('The original body'),
				current: expect.stringContaining('The rewritten body')
			});
	});

	// Nothing to compare against until a version is chosen, and an empty diff pane
	// reads as "no changes" rather than "nothing picked".
	it('withholds the restore action until a version is selected', async () => {
		const screen = await render(NoteVersionHistory, base);
		expect(
			await screen.getByRole('button', { name: 'Restore previous version' }).all()
		).toHaveLength(0);
	});

	it('offers to restore the selected version', async () => {
		const screen = await render(NoteVersionHistory, { ...base, selected: revision });
		expect(
			await screen.getByRole('button', { name: 'Restore previous version' }).all()
		).not.toHaveLength(0);
	});

	it('explains that a note with no history has never been published', async () => {
		const screen = await render(NoteVersionHistory, { ...base, revisions: [] });
		expect(await screen.getByText('No versions yet').all()).not.toHaveLength(0);
	});
});

describe('NoteVersionHistory feedback', () => {
	it('explains that restoring replaces unpublished changes', async () => {
		const screen = await render(NoteVersionHistory, { ...base, selected: revision });
		expect(
			await screen
				.getByText('Published versions remain in history. Unpublished changes will be replaced.')
				.all()
		).toHaveLength(1);
	});
	it('warns about unpublished changes before confirmation', async () => {
		const screen = await render(NoteVersionHistory, { ...base, selected: revision });
		await screen.getByRole('button', { name: 'Restore previous version' }).click();
		expect(
			await screen
				.getByText(
					'This replaces the current note, including unpublished changes. Only published versions remain in history.'
				)
				.all()
		).toHaveLength(1);
	});
	it('shows initial loading before an empty history is known', async () => {
		const screen = await render(NoteVersionHistory, {
			...base,
			revisions: [],
			readState: { kind: 'loading' }
		});
		expect(await screen.getByText('Loading version history…').all()).toHaveLength(1);
	});
});

it('keeps a failed history read distinct from an empty history', async () => {
	const screen = await render(NoteVersionHistory, {
		...base,
		revisions: [],
		readState: {
			kind: 'failure',
			message: 'Could not load the version history. Close this dialog and try again.'
		}
	});
	await expect
		.element(screen.getByRole('alert'))
		.toHaveTextContent('Could not load the version history.');
});
it('withholds restoration while the selected snapshot is loading', async () => {
	const screen = await render(NoteVersionHistory, {
		...base,
		selected: revision,
		readState: { kind: 'loading' }
	});
	expect(await screen.getByRole('button', { name: 'Restore previous version' }).all()).toHaveLength(
		0
	);
});

it('keeps history open when restoration is blocked or fails', async () => {
	const screen = await render(NoteVersionHistory, {
		...base,
		selected: revision,
		onrestore: async () => false
	});
	await screen.getByRole('button', { name: 'Restore previous version' }).click();
	await screen.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect
		.element(screen.getByRole('dialog', { name: 'Version history', exact: true }))
		.toBeVisible();
});
it('closes history after restoration succeeds', async () => {
	const screen = await render(NoteVersionHistory, { ...base, selected: revision });
	await screen.getByRole('button', { name: 'Restore previous version' }).click();
	await screen.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect
		.element(screen.getByRole('dialog', { name: 'Version history', exact: true }))
		.not.toBeInTheDocument();
});
