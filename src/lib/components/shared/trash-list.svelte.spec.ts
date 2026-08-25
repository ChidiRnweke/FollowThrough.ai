import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TrashList from './trash-list.svelte';
import { noteTrashEntry, type TrashEntry } from './trash-entry';
import type { NoteId, TrashedNote } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import { diagramTrashEntry } from './trash-entry';

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

const trashedDiagram = {
	id: '30000000-0000-4000-8000-000000000001' as DiagramId,
	projectId,
	kind: 'drawio',
	title: 'Ingest pipeline',
	source: '<mxfile/>',
	searchableText: '',
	currentRevision: 1,
	publishedRevision: 1,
	userId: trashed.id as unknown as Diagram['userId'],
	archivedAt: '2026-07-12T09:00:00.000Z' as Diagram['createdAt'],
	createdAt: '2026-07-12T08:00:00.000Z' as Diagram['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Diagram['updatedAt']
} satisfies Diagram;

const noop = async () => undefined;

describe('TrashList', () => {
	it('names each trashed note', async () => {
		const screen = await render(TrashList, { entries: [noteTrashEntry(trashed)], onrestore: noop });
		expect(await screen.getByText('Deleted draft').all()).not.toHaveLength(0);
	});

	it('restores a note through onrestore', async () => {
		const restored: NoteId[] = [];
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed)],
			onrestore: async (entry: TrashEntry) => {
				restored.push(entry.id as NoteId);
			}
		});
		await screen.getByRole('button', { name: 'Restore' }).click();
		expect(restored).toEqual([noteId]);
	});

	it('says the trash is empty rather than showing nothing', async () => {
		const screen = await render(TrashList, { entries: [], onrestore: noop });
		expect(await screen.getByText('The trash is empty').all()).not.toHaveLength(0);
	});

	// Permanent deletion is the one thing here that cannot be undone, so it never fires
	// straight off the row's button.
	it('asks before deleting a note for good', async () => {
		const deleted: NoteId[] = [];
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed)],
			onrestore: noop,
			ondelete: async (entry: TrashEntry) => {
				deleted.push(entry.id as NoteId);
			}
		});
		await screen.getByRole('button', { name: 'Delete Deleted draft forever' }).click();
		expect(deleted).toEqual([]);
	});

	it('deletes a note through ondelete once confirmed', async () => {
		const deleted: NoteId[] = [];
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed)],
			onrestore: noop,
			ondelete: async (entry: TrashEntry) => {
				deleted.push(entry.id as NoteId);
			}
		});
		await screen.getByRole('button', { name: 'Delete Deleted draft forever' }).click();
		await screen.getByRole('button', { name: 'Delete forever' }).click();
		expect(deleted).toEqual([noteId]);
	});

	it('offers no permanent delete when the caller does not pass one', async () => {
		const screen = await render(TrashList, { entries: [noteTrashEntry(trashed)], onrestore: noop });
		expect(await screen.getByRole('button', { name: /forever/ }).all()).toHaveLength(0);
	});

	it('empties the trash through onempty once confirmed', async () => {
		let emptied = 0;
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed)],
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
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed)],
			showProject: false,
			onrestore: noop
		});
		expect(await screen.getByText(/FollowThrough/).all()).toHaveLength(0);
	});

	// The trash is the only screen where a note and a diagram sit in one list, so a
	// row has to say which it is. The kind label and the icon carry that together.
	it('says which kind each row is', async () => {
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed), diagramTrashEntry(trashedDiagram, 'FollowThrough')],
			onrestore: noop
		});
		expect(await screen.getByText(/Diagram/).all()).not.toHaveLength(0);
	});

	it('names a trashed diagram beside a trashed note', async () => {
		const screen = await render(TrashList, {
			entries: [noteTrashEntry(trashed), diagramTrashEntry(trashedDiagram, 'FollowThrough')],
			onrestore: noop
		});
		expect(await screen.getByText('Ingest pipeline').all()).not.toHaveLength(0);
	});

	// Restore hands back the entry rather than an id, so the caller narrows once and
	// cannot send a DiagramId to the note command.
	it('restores a diagram as a diagram entry', async () => {
		const restored: TrashEntry['kind'][] = [];
		const screen = await render(TrashList, {
			entries: [diagramTrashEntry(trashedDiagram, 'FollowThrough')],
			onrestore: async (entry: TrashEntry) => {
				restored.push(entry.kind);
			}
		});
		await screen.getByRole('button', { name: 'Restore' }).click();
		expect(restored).toEqual(['diagram']);
	});
});
