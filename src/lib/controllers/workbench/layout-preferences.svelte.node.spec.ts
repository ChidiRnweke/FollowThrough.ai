import { describe, expect, it } from 'vitest';
import { createWorkbenchContext } from '$lib/testing/workbench/context';
import { InMemoryWorkbenchLayout } from '$lib/testing/workbench/fakes/in-memory-layout';
import { InMemoryWorkbenchRouter } from '$lib/testing/workbench/fakes/in-memory-router';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const setup = () => {
	const repository = new InMemoryWorkbenchLayout();
	const router = new InMemoryWorkbenchRouter(`/notes/${first}`);
	return { repository, router, ...createWorkbenchContext(router, repository) };
};

describe('workbench retained layout preferences', () => {
	it('saves strip visibility in the fast preference and account layout', async () => {
		const { layout, preferences, repository, view } = setup();
		await layout.hydrate();
		layout.toggleStripHidden();
		await expect
			.poll(() => ({
				view: view.stripHidden,
				fast: preferences.stripHidden,
				saved: repository.record?.stripHidden
			}))
			.toEqual({ view: true, fast: true, saved: true });
	});
	it('retains the clamped split width on both persistence paths', async () => {
		const { layout, preferences, repository, view } = setup();
		await layout.hydrate();
		layout.setSplitRatio(0.9);
		await expect
			.poll(() => ({
				view: view.splitRatio,
				fast: preferences.splitRatio,
				saved: repository.record?.splitRatio
			}))
			.toEqual({ view: 0.75, fast: 0.75, saved: 0.75 });
	});
	it('restores account preferences over first-paint device preferences', async () => {
		const { layout, preferences, repository, view } = setup();
		preferences.stripHidden = true;
		preferences.splitRatio = 0.7;
		repository.record = {
			id: 'current',
			openTabs: [first, second],
			focusedNoteId: first,
			pinnedTabs: [second],
			recentlyUsed: [second, first],
			stripHidden: false,
			splitRatio: 0.35
		};
		await layout.hydrate();
		expect({ hidden: view.stripHidden, ratio: view.splitRatio, pins: view.pinnedTabs }).toEqual({
			hidden: false,
			ratio: 0.35,
			pins: [second]
		});
	});
	it('keeps the durable layout after a failed restore and reports the failure', async () => {
		const { layout, preferences, repository, view } = setup();
		repository.record = {
			id: 'current',
			openTabs: [first, second],
			focusedNoteId: second,
			pinnedTabs: [],
			recentlyUsed: [],
			stripHidden: false,
			splitRatio: 0.5
		};
		repository.readError = new Error('Saved tabs could not be read');
		await layout.hydrate();
		expect({
			live: view.openTabs,
			saved: repository.record.openTabs,
			error: preferences.errors[0]?.message
		}).toEqual({ live: [first], saved: [first, second], error: 'Saved tabs could not be read' });
	});
	it('reports a failed save while leaving the live navigation usable', async () => {
		const { layout, navigation, preferences, repository, view } = setup();
		await layout.hydrate();
		repository.writeError = new Error('Device full');
		await navigation.openTab(second);
		expect({
			live: view.openTabs,
			saved: repository.record?.openTabs,
			error: preferences.errors.at(-1)?.message
		}).toEqual({ live: [first, second], saved: [first], error: 'Device full' });
	});
	it('closes the previous account repository when rebinding', () => {
		const { repository, attach } = setup();
		attach(new InMemoryWorkbenchLayout());
		expect(repository.closed).toBe(true);
	});
	it('preserves a chat session key while its saved conversation supplies the pathname', async () => {
		const { layout, navigation, conversations, router, view } = setup();
		await layout.hydrate();
		conversations.conversations.set(second, { conversationId: first });
		await navigation.openSplit(`chat:${second}`, `diagram:${first}`);
		expect({ path: router.url.pathname, focus: view.focusedTabId, split: view.splitTabId }).toEqual(
			{ path: `/chats/${first}`, focus: `chat:${second}`, split: `diagram:${first}` }
		);
	});
	it('keeps interaction focus in the second pane when the primary URL is reconciled', async () => {
		const { layout, navigation, view } = setup();
		await layout.hydrate();
		await navigation.openSplit(first, second);
		navigation.setInteractionFocus(second);
		layout.syncFromUrl();
		expect({ primary: view.focusedTabId, interaction: view.interactionFocusedNoteId }).toEqual({
			primary: first,
			interaction: second
		});
	});
});
