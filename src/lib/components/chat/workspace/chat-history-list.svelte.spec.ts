import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChatHistoryList from './chat-history-list.svelte';
import type { Conversation } from '$lib/models/agent';

const conversation = (id: string, title?: string): Conversation => ({
	id: `20000000-0000-4000-8000-${id.padStart(12, '0')}` as Conversation['id'],
	userId: '30000000-0000-4000-8000-000000000001' as Conversation['userId'],
	kind: 'chat',
	title,
	createdAt: '2026-07-12T08:00:00.000Z' as Conversation['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Conversation['updatedAt']
});

describe('ChatHistoryList', () => {
	it('selects a conversation through onselect', async () => {
		const selected: string[] = [];
		const session = conversation('000000000001', 'Reviewed draft');
		const screen = await render(ChatHistoryList, {
			sessions: [session],
			onselect: (id) => selected.push(id)
		});
		await screen.getByRole('button', { name: 'Reviewed draft Workspace chat' }).click();
		expect(selected).toEqual([session.id]);
	});

	it('shows the empty state without conversations', async () => {
		const screen = await render(ChatHistoryList, { sessions: [], onselect: () => undefined });
		expect(await screen.getByText('No past conversations yet.').all()).not.toHaveLength(0);
	});
});
