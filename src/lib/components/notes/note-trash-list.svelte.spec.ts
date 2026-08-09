import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteTrashList from './note-trash-list.svelte';
import type { NoteId, TrashedNote } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

const noteId = '20000000-0000-4000-8000-000000000001' as NoteId;
const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;

const trashed: TrashedNote = {
	id: noteId,
	projectId,
	kind: 'note',
	position: 0,
	title: 'Deleted draft',
	isPinned: false,
	currentRevision: 3,
	projectName: 'FollowThrough',
	archivedAt: '2026-07-12T08:00:00.000Z' as TrashedNote['archivedAt'],
	createdAt: '2026-07-12T08:00:00.000Z' as TrashedNote['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as TrashedNote['updatedAt']
};

const noop = async () => undefined;

describe('NoteTrashList', () => {
	it('names each trashed note', async () => {
		const screen = await render(NoteTrashList, { notes: [trashed], onrestore: noop });
		expect(await screen.getByText('Deleted draft').all()).not.toHaveLength(0);
	});

	it('restores a note through onrestore', async () => {
		const restored: NoteId[] = [];
		const screen = await render(NoteTrashList, {
			notes: [trashed],
			onrestore: async (id) => {
				restored.push(id);
			}
		});
		await screen.getByRole('button', { name: 'Restore' }).click();
		expect(restored).toEqual([noteId]);
	});

	it('says the trash is empty rather than showing nothing', async () => {
		const screen = await render(NoteTrashList, { notes: [], onrestore: noop });
		expect(await screen.getByText('The trash is empty').all()).not.toHaveLength(0);
	});

	// Permanent deletion is the one thing here that cannot be undone, so it never fires
	// straight off the row's button.
	it('asks before deleting a note for good', async () => {
		const deleted: NoteId[] = [];
		const screen = await render(NoteTrashList, {
			notes: [trashed],
			onrestore: noop,
			ondelete: async (id) => {
				deleted.push(id);
			}
		});
		await screen.getByRole('button', { name: 'Delete Deleted draft forever' }).click();
		expect(deleted).toEqual([]);
	});

	it('deletes a note through ondelete once confirmed', async () => {
		const deleted: NoteId[] = [];
		const screen = await render(NoteTrashList, {
			notes: [trashed],
			onrestore: noop,
			ondelete: async (id) => {
				deleted.push(id);
			}
		});
		await screen.getByRole('button', { name: 'Delete Deleted draft forever' }).click();
		await screen.getByRole('button', { name: 'Delete forever' }).click();
		expect(deleted).toEqual([noteId]);
	});

	it('offers no permanent delete when the caller does not pass one', async () => {
		const screen = await render(NoteTrashList, { notes: [trashed], onrestore: noop });
		expect(await screen.getByRole('button', { name: /forever/ }).all()).toHaveLength(0);
	});

	it('empties the trash through onempty once confirmed', async () => {
		let emptied = 0;
		const screen = await render(NoteTrashList, {
			notes: [trashed],
			onrestore: noop,
			onempty: async () => {
				emptied += 1;
			}
		});
		await screen.getByRole('button', { name: 'Empty trash' }).first().click();
		await screen.getByRole('button', { name: 'Empty trash' }).last().click();
		expect(emptied).toBe(1);
	});

	// Inside a project every row would repeat the same project name.
	it('omits the project name when the caller suppresses it', async () => {
		const screen = await render(NoteTrashList, {
			notes: [trashed],
			showProject: false,
			onrestore: noop
		});
		expect(await screen.getByText(/FollowThrough/).all()).toHaveLength(0);
	});
});
