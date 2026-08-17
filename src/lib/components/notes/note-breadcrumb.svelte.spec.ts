import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteBreadcrumb from './note-breadcrumb.svelte';
import type { Note, NoteSummary } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ShellContext } from '$lib/models/workspace';

const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;
const userId = '20000000-0000-4000-8000-000000000001' as Note['userId'];
const timestamp = '2026-07-12T08:00:00.000Z' as Note['createdAt'];

function folder(id: string, title: string, parentId?: string): NoteSummary {
	return {
		id: id as Note['id'],
		projectId,
		parentId: parentId as Note['parentId'],
		kind: 'folder',
		position: 0,
		title,
		isPinned: false,
		currentRevision: 1,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

const outer = folder('00000000-0000-4000-8000-000000000010', 'hierarchy test');
const inner = folder('00000000-0000-4000-8000-000000000011', 'a test folder', outer.id);

const note: Note = {
	id: '00000000-0000-4000-8000-000000000001' as Note['id'],
	userId,
	projectId,
	parentId: inner.id,
	kind: 'note',
	position: 0,
	title: 'second note',
	document: { type: 'doc', content: [] },
	plainText: '',
	currentRevision: 1,
	publishedRevision: 1,
	isPinned: false,
	createdAt: timestamp,
	updatedAt: timestamp
};

const shell: ShellContext = {
	user: {
		id: userId,
		displayName: 'Tester',
		email: 'tester@local.invalid',
		role: 'USER',
		createdAt: timestamp as ShellContext['user']['createdAt'],
		updatedAt: timestamp as ShellContext['user']['updatedAt']
	},
	projects: [{ id: projectId, name: 'test project 3' } as ShellContext['projects'][number]],
	noteTree: [outer, inner],
	skills: [],
	pendingSuggestionCount: 0,
	pendingMemoryNotifications: []
};

describe('NoteBreadcrumb folder chain', () => {
	it('names the whole path on the collapsed crumb of a nested note', async () => {
		const screen = await render(NoteBreadcrumb, { shell, note });
		expect(
			await screen
				.getByLabelText('test project 3 / hierarchy test / a test folder', { exact: true })
				.all()
		).toHaveLength(1);
	});

	it('drops the folder names from the row of a nested note', async () => {
		const screen = await render(NoteBreadcrumb, { shell, note });
		expect(await screen.getByText('a test folder', { exact: true }).all()).toHaveLength(0);
	});

	it('still shows the note title of a nested note', async () => {
		const screen = await render(NoteBreadcrumb, { shell, note });
		expect(await screen.getByText('second note', { exact: true }).all()).not.toHaveLength(0);
	});

	it('spells the project out when the note is not in a folder', async () => {
		const flat = { ...note, parentId: undefined };
		const screen = await render(NoteBreadcrumb, { shell, note: flat });
		expect(await screen.getByText('test project 3', { exact: true }).all()).not.toHaveLength(0);
	});
});
