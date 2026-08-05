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
