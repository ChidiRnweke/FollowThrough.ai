import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteWorkspaceDialogs from './note-workspace-dialogs.svelte';
import type { DiagramSuggestion } from '$lib/models/diagrams';
import type { Note } from '$lib/models/notes';
import type { WriteConflictView } from '$lib/models/outbox';

const noteId = '00000000-0000-4000-8000-000000000001' as Note['id'];
const userId = '20000000-0000-4000-8000-000000000001' as Note['userId'];
const projectId = '30000000-0000-4000-8000-000000000001' as Note['projectId'];

const note = (title: string): Note => ({
	id: noteId,
	userId,
	projectId,
	kind: 'note',
	position: 0,
	title,
	document: { type: 'doc', content: [] },
	plainText: '',
	currentRevision: 1,
	publishedRevision: 1,
	isPinned: false,
	createdAt: '2026-07-12T08:00:00.000Z' as Note['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Note['updatedAt']
});

const conflictRecord: WriteConflictView<Note> = {
	base: note('Base'),
	local: note('Local edit'),
	remote: { kind: 'found', value: note('Remote edit') }
};

const base = {
	note: note('Draft'),
	conflictRecord,
	reviewingSuggestion: null,
	onUseRemote: async () => undefined,
	onKeepLocal: async () => undefined,
	onAcceptDrawio: async () => undefined,
	historyRevisions: [],
	onSelectRevision: () => undefined,
	onRestoreRevision: async () => undefined
};

describe('NoteWorkspaceDialogs conflict resolution', () => {
	it('keeps the local version through onKeepLocal', async () => {
		let kept = 0;
		const screen = await render(NoteWorkspaceDialogs, {
			...base,
			conflictOpen: true,
			onKeepLocal: async () => {
				kept += 1;
			}
		});
		await screen.getByRole('button', { name: 'Keep mine' }).click();
		expect(kept).toBe(1);
	});

	it('uses the remote version through onUseRemote', async () => {
		let usedRemote = 0;
		const screen = await render(NoteWorkspaceDialogs, {
			...base,
			conflictOpen: true,
			onUseRemote: async () => {
				usedRemote += 1;
			}
		});
		await screen.getByRole('button', { name: 'Use latest' }).click();
		expect(usedRemote).toBe(1);
	});

	it('offers to review a pending draw.io conversion', async () => {
		const suggestion = {
			id: '50000000-0000-4000-8000-000000000001',
			userId,
			kind: 'diagram',
			status: 'accepted',
			payload: { noteId, kind: 'drawio', title: 'Architecture', source: '<mxfile/>' },
			confidence: 0.9,
			provenanceId: '60000000-0000-4000-8000-000000000001',
			isAutoAccepted: false,
			createdAt: '2026-07-12T08:00:00.000Z',
			updatedAt: '2026-07-12T08:00:00.000Z'
		} as DiagramSuggestion;
		const screen = await render(NoteWorkspaceDialogs, {
			...base,
			reviewDialogOpen: true,
			reviewingSuggestion: suggestion
		});
		// The dialog names the diagram it is reviewing rather than restating its own
		// mechanics; what it is for is carried by its description.
		expect(await screen.getByRole('dialog', { name: /Architecture/ }).all()).not.toHaveLength(0);
	});
});
