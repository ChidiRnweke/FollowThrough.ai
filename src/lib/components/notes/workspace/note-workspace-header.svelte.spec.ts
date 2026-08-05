import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteWorkspaceHeader from './note-workspace-header.svelte';
import type { Note, NoteSummary } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ShellContext } from '$lib/models/workspace';
import type { NoteSyncStore } from '$lib/stores/notes/note-sync.svelte';

const noteId = '00000000-0000-4000-8000-000000000001' as Note['id'];
const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;
const userId = '20000000-0000-4000-8000-000000000001' as Note['userId'];

const note: Note = {
	id: noteId,
	userId,
	projectId,
	kind: 'note',
	position: 0,
	title: 'Reviewed draft',
	document: { type: 'doc', content: [] },
	plainText: '',
	currentRevision: 1,
	publishedRevision: 1,
	isPinned: false,
	createdAt: '2026-07-12T08:00:00.000Z' as Note['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Note['updatedAt']
};

const shell: ShellContext = {
	user: {
		id: userId,
		displayName: 'Tester',
		email: 'tester@local.invalid',
		role: 'USER',
		createdAt: '2026-07-12T08:00:00.000Z' as ShellContext['user']['createdAt'],
		updatedAt: '2026-07-12T08:00:00.000Z' as ShellContext['user']['updatedAt']
	},
	projects: [],
	noteTree: [],
	skills: [],
	pendingSuggestionCount: 0,
	pendingMemoryNotifications: []
};

const noteSync = { status: 'synced', lastError: undefined } as unknown as NoteSyncStore;

const folders: readonly NoteSummary[] = [];

const props = {
	shell,
	note,
	projectId,
	noteSync,
	dirty: false,
	saveFailed: false,
	unsynced: false,
	hasUnpublishedChanges: true,
	publishing: false,
	comparable: false,
	folders,
	ontitle: () => undefined,
	onadvance: () => undefined,
	onreviewconflict: () => undefined,
	onretry: () => undefined,
	onpublish: () => undefined,
	onexport: () => undefined,
	onask: () => undefined,
	oncompare: () => undefined,
	ontogglepin: () => undefined,
	onmove: () => undefined,
	ondiscard: () => undefined,
	onarchive: () => undefined
};

describe('NoteWorkspaceHeader actions', () => {
	it('keeps the Publish action available', async () => {
		const screen = await render(NoteWorkspaceHeader, props);
		expect(
			await screen.getByRole('button', { name: 'Publish note (Ctrl+S, S)' }).all()
		).not.toHaveLength(0);
	});

	it('exposes Export through the note-actions overflow menu', async () => {
		const screen = await render(NoteWorkspaceHeader, props);
		await screen.getByRole('button', { name: 'Note actions' }).click();
		expect(await screen.getByRole('menuitem', { name: 'Export document' }).all()).not.toHaveLength(
			0
		);
	});

	it('renders the inline Export button', async () => {
		const screen = await render(NoteWorkspaceHeader, props);
		expect(await screen.getByRole('button', { name: 'Export document' }).all()).not.toHaveLength(0);
	});
});
