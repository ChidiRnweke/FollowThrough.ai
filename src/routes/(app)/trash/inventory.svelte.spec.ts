import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TrashPage from './+page.svelte';
import type { WorkspaceSession } from '$lib/stores/workspace/session.svelte';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';

const sessions: ReturnType<typeof workspaceResourcesFixture>[] = [];
afterEach(() => {
	for (const session of sessions) session.resources.stop();
	sessions.length = 0;
});
const pageSession = (fixture: ReturnType<typeof workspaceResourcesFixture>): WorkspaceSession => {
	const accountId = testActor().userId;
	const agentDefaults = { chatModelId: 'provider/chat', visionModelId: 'provider/vision' };
	return {
		resources: fixture.resources,
		bootstrap: {
			accountId,
			agentDefaults,
			agentModels: [],
			agentAvailable: false,
			numericDefaults: { webSearchMaxResults: 5, webSearchMaxTotalResults: 10, agentMaxTurns: 10 }
		},
		startupError: null,
		get shell() {
			const shell = fixture.resources.views.shell(accountId);
			if (!shell) throw new Error('The fixture account is missing');
			return shell;
		},
		get preferences() {
			return fixture.resources.views.agentPreferences(accountId);
		},
		agentDefaults,
		agentModels: [],
		sessions: []
	};
};
const setup = async (knownTrash = false) => {
	const session = workspaceResourcesFixture(testActor().userId);
	sessions.push(session);
	const project = projectBuilder({ role: 'inbox' });
	await session.cache.accept(workspaceResourceKey({ type: 'projects', id: [project.id] }), {
		etag: syncEtag(1n),
		value: { type: 'projects', value: project }
	});
	const user = {
		id: testActor().userId,
		email: 'reader@example.test',
		displayName: 'Reader',
		role: 'USER' as const,
		createdAt: testNow,
		updatedAt: testNow
	};
	await session.cache.accept(workspaceResourceKey({ type: 'users', id: [user.id] }), {
		etag: syncEtag(1n),
		value: { type: 'users', value: user }
	});
	if (knownTrash) {
		const note = noteBuilder({ title: 'Known trashed note', archivedAt: testNow });
		await session.cache.accept(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
			etag: syncEtag(2n),
			value: { type: 'notes', value: note }
		});
	}
	await session.resources.initialize();
	session.resources.setOnline(false);
	return session;
};
it('does not call a partially downloaded trash inventory empty', async () => {
	const session = await setup();
	const screen = await render(TrashPage, {
		data: { session: pageSession(session), sidebarWidth: 280, sidebarOpen: true }
	});
	await expect
		.element(screen.getByText('The trash is empty', { exact: true }))
		.not.toBeInTheDocument();
});
it('keeps downloaded trash rows visible while the inventory is incomplete', async () => {
	const session = await setup(true);
	const screen = await render(TrashPage, {
		data: { session: pageSession(session), sidebarWidth: 280, sidebarOpen: true }
	});
	await expect.element(screen.getByText('Known trashed note', { exact: true })).toBeVisible();
});
it('does not offer to empty an incomplete trash inventory', async () => {
	const session = await setup(true);
	const screen = await render(TrashPage, {
		data: { session: pageSession(session), sidebarWidth: 280, sidebarOpen: true }
	});
	await expect
		.element(screen.getByRole('button', { name: 'Empty trash', exact: true }))
		.not.toBeInTheDocument();
});
it('shows the empty state after the real cache completes its inventory', async () => {
	const session = await setup();
	const screen = await render(TrashPage, {
		data: { session: pageSession(session), sidebarWidth: 280, sidebarOpen: true }
	});
	session.resources.setOnline(true);
	await session.resources.requireCollections();
	await expect.element(screen.getByText('The trash is empty', { exact: true })).toBeVisible();
});
