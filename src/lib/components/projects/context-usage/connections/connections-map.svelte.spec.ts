import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type {
	ConnectionNode,
	ItemKey,
	ProjectConnectionsReport,
	ReadTogether
} from '$lib/models/context-usage';
import {
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import ConnectionsMap from './connections-map.svelte';

const note = (index: number, chats: number): ConnectionNode => ({
	key: `note:${testNoteId(index)}`,
	item: { kind: 'note', id: testNoteId(index), title: `Note ${index}` },
	use: { kind: 'read', times: chats, lastAt: testNow },
	chats
});
const skill: ConnectionNode = {
	key: `skill:${testNoteId(99)}`,
	item: { kind: 'skill', id: testNoteId(99), title: 'FollowThrough' },
	use: { kind: 'read', times: 9, lastAt: testNow },
	chats: 9
};
const key = (index: number): ItemKey => `note:${testNoteId(index)}`;
const pair = (a: ItemKey, b: ItemKey, chats: number): ReadTogether => ({
	a,
	b,
	chats,
	aFirst: chats,
	bFirst: 0
});

const report: ProjectConnectionsReport = {
	nodes: [skill, note(1, 5), note(2, 4), note(3, 2)],
	together: [pair(key(1), key(2), 4), pair(key(2), key(3), 1), pair(skill.key, key(1), 5)],
	links: [],
	chats: 10,
	memoryLeftOut: 0,
	mismatches: { linkedNeverTogether: [], togetherNotLinked: [] },
	ambient: [skill.key],
	defaultThreshold: 2
};

it('starts at the report threshold and says how many weaker pairs it hides', async () => {
	const screen = await render(ConnectionsMap, { report, projectId: testProjectId() });
	await expect.element(screen.getByText(/fewer than 2 chats are hidden \(1\)/)).toBeVisible();
});

it('names the item read in most chats, whose pairs wait for a selection', async () => {
	const screen = await render(ConnectionsMap, { report, projectId: testProjectId() });
	await expect
		.element(
			screen.getByText(/is read in 9 of 10 chats, so its pairs show only when it is selected/)
		)
		.toBeVisible();
});

it('shows what a selected item is read with', async () => {
	const screen = await render(ConnectionsMap, { report, projectId: testProjectId() });
	(screen.getByRole('button', { name: /^Note 1 · Note/ }).element() as HTMLElement).dispatchEvent(
		new MouseEvent('click', { bubbles: true })
	);
	const panel = screen.getByRole('complementary', { name: 'Selected item' });
	await expect.element(panel.getByRole('heading', { name: 'Read with' })).toBeVisible();
	expect(panel.element().textContent).toMatch(
		/Read with\s*FollowThrough\s*5 chats\s*Note 2\s*4 chats/
	);
});

it('lists the pairs as a table with the counts the map draws', async () => {
	const screen = await render(ConnectionsMap, { report, projectId: testProjectId() });
	(screen.getByRole('radio', { name: 'Table' }).element() as HTMLElement).click();
	await expect.element(screen.getByRole('cell', { name: '4', exact: true })).toBeVisible();
});
