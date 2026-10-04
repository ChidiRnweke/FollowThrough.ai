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
	await expect.element(screen.getByText('Deep active note', { exact: true })).toBeVisible();
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

function folderWithNote(folderIndex: number, title: string) {
	const folder = noteBuilder({
		id: testNoteId(folderIndex),
		kind: 'folder',
		title,
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	const note = noteBuilder({ id: testNoteId(folderIndex + 1), parentId: folder.id });
	return { folder, note };
}

it('keeps a collapsed ancestor closed after the tree refreshes', async () => {
	const { folder, note } = folderWithNote(40, 'Refreshed folder');
	const screen = await render(ProjectTreeExpansionFixture, {
		projects: [projectBuilder()],
		notes: [folder, note],
		activeNoteId: note.id
	});
	const toggle = screen.getByRole('button', { name: 'Refreshed folder', exact: true });
	await toggle.click();
	await screen.rerender({ notes: [folder, note] });
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
});

it('keeps a collapsed ancestor closed after the sidebar remounts', async () => {
	const { folder, note } = folderWithNote(50, 'Remounted folder');
	const props = { projects: [projectBuilder()], notes: [folder, note], activeNoteId: note.id };
	const first = await render(ProjectTreeExpansionFixture, props);
	await first.getByRole('button', { name: 'Remounted folder', exact: true }).click();
	first.unmount();
	const screen = await render(ProjectTreeExpansionFixture, props);
	await expect
		.element(screen.getByRole('button', { name: 'Remounted folder', exact: true }))
		.toHaveAttribute('aria-expanded', 'false');
});

it('reveals the ancestors again when the active note changes', async () => {
	const first = folderWithNote(60, 'First folder');
	const second = folderWithNote(70, 'Second folder');
	const notes = [first.folder, first.note, second.folder, second.note];
	const screen = await render(ProjectTreeExpansionFixture, {
		projects: [projectBuilder()],
		notes,
		activeNoteId: first.note.id
	});
	await screen.rerender({ activeNoteId: second.note.id });
	await expect
		.element(screen.getByRole('button', { name: 'Second folder', exact: true }))
		.toHaveAttribute('aria-expanded', 'true');
});
