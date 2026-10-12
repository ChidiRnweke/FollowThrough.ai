import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatUsage } from '$lib/models/context-usage';
import {
	testConversationId,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import RecentChats from './recent-chats.svelte';

const chats: ChatUsage[] = Array.from({ length: 12 }, (_, index) => ({
	conversationId: testConversationId(index + 1),
	title: `Chat ${index + 1}`,
	lastUsedAt: testNow,
	items: [{ kind: 'note', id: testNoteId(index + 1), title: `Note ${index + 1}` }]
}));

it('shows five chats a page and moves to the next five', async () => {
	const screen = await render(RecentChats, { chats, projectId: testProjectId() });
	await screen.getByRole('button', { name: 'Page 2' }).click();
	await expect.element(screen.getByRole('link', { name: 'Chat 6', exact: true })).toBeVisible();
	await expect.element(screen.getByText('6–10 of 12')).toBeVisible();
	expect(screen.getByRole('link', { name: 'Chat 5', exact: true }).query()).toBeNull();
});

it('opens only the newest chat to show what it read', async () => {
	const screen = await render(RecentChats, { chats, projectId: testProjectId() });
	await expect.element(screen.getByRole('link', { name: 'Note 1' })).toBeVisible();
	expect(screen.getByRole('link', { name: 'Note 2' }).query()).toBeNull();
});
