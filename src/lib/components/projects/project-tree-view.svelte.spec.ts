import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProjectTreeViewFixture from './project-tree-view.fixture.svelte';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import type { Project, ProjectId } from '$lib/models/projects';

const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;
const noteId = '20000000-0000-4000-8000-000000000001' as NoteId;

const project: Project = {
	id: projectId,
	userId: '30000000-0000-4000-8000-000000000001' as Project['userId'],
	name: 'FollowThrough',
	createdAt: '2026-07-12T08:00:00.000Z' as Project['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Project['updatedAt']
};

const note: NoteSummary = {
	id: noteId,
	projectId,
	kind: 'note',
	position: 0,
	title: 'Reviewed draft',
	isPinned: false,
	archivedAt: undefined,
	currentRevision: 1,
	createdAt: '2026-07-12T08:00:00.000Z' as NoteSummary['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as NoteSummary['updatedAt']
};

describe('ProjectTreeView', () => {
	it('renders the project and its notes', async () => {
		const screen = await render(ProjectTreeViewFixture, { projects: [project], notes: [note] });
		const titles = ['FollowThrough', 'Reviewed draft'].map((title) => screen.getByText(title));
		expect((await Promise.all(titles.map((locator) => locator.all()))).every((found) => found.length > 0)).toBe(
			true
		);
	});

	it('opens a note through onopen', async () => {
		const opened: string[] = [];
		const screen = await render(ProjectTreeViewFixture, {
			projects: [project],
			notes: [note],
			onopen: (id) => opened.push(id)
		});
		await screen.getByText('Reviewed draft').click();
		expect(opened).toEqual([noteId]);
	});
});
