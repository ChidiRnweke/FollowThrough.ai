import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import ProjectTreeExpansionFixture from './project-tree-expansion.fixture.svelte';

afterEach(() => localStorage.removeItem('workbench.tree.expanded'));

it('expands every ancestor of an active note deeper than 32 folders', async () => {
	localStorage.removeItem('workbench.tree.expanded');
	const folders = Array.from({ length: 35 }, (_, index) =>
		noteBuilder({
			id: testNoteId(index + 1),
			title: `Folder ${index + 1}`,
			kind: 'folder',
			...(index ? { parentId: testNoteId(index) } : {}),
			document: { type: 'doc', content: [] },
			plainText: ''
		})
	);
	const active = noteBuilder({
		id: testNoteId(36),
		parentId: testNoteId(35),
		title: 'Deep active note'
	});
	const screen = await render(ProjectTreeExpansionFixture, {
		projects: [projectBuilder()],
		notes: [...folders, active],
		activeNoteId: active.id
	});
	await expect
		.element(screen.getByRole('button', { name: 'Folder 1', exact: true }))
		.toHaveAttribute('aria-expanded', 'true');
});

it('allows the reader to collapse an ancestor after opening the active note', async () => {
	const folder = noteBuilder({
		kind: 'folder',
		title: 'Folder',
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	const note = noteBuilder({ id: testNoteId(2), parentId: folder.id });
	const screen = await render(ProjectTreeExpansionFixture, {
		projects: [projectBuilder()],
		notes: [folder, note],
		activeNoteId: note.id
	});
	const toggle = screen.getByRole('button', { name: 'Folder', exact: true });
	await toggle.click();
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
});
it('restores a saved collapsed project on the next mount', async () => {
	const project = projectBuilder();
	localStorage.setItem('workbench.tree.expanded', JSON.stringify([`project:${project.id}`]));
	const screen = await render(ProjectTreeExpansionFixture, { projects: [project], notes: [] });
	await expect
		.element(screen.getByRole('button', { name: `Expand ${project.name}`, exact: true }))
		.toBeVisible();
});
it('saves folder expansion for the next visit', async () => {
	const folder = noteBuilder({
		kind: 'folder',
		title: 'Folder',
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	const screen = await render(ProjectTreeExpansionFixture, {
		projects: [projectBuilder()],
		notes: [folder]
	});
	await screen.getByRole('button', { name: 'Folder', exact: true }).click();
	await expect
		.poll(() => localStorage.getItem('workbench.tree.expanded'))
		.toBe(JSON.stringify([folder.id]));
});

it('renders the active note beyond the old eight-level rendering cutoff', async () => {
	const folders = Array.from({ length: 12 }, (_, index) =>
		noteBuilder({
			id: testNoteId(index + 1),
			title: `Folder ${index + 1}`,
			kind: 'folder',
			...(index ? { parentId: testNoteId(index) } : {}),
			document: { type: 'doc', content: [] },
			plainText: ''
		})
	);
	const active = noteBuilder({
		id: testNoteId(13),
		parentId: testNoteId(12),
		title: 'Deep active note'
	});
	const screen = await render(ProjectTreeExpansionFixture, {
		projects: [projectBuilder()],
		notes: [...folders, active],
		activeNoteId: active.id
	});
	await expect.element(screen.getByText('Deep active note', { exact: true })).toBeVisible();
});
