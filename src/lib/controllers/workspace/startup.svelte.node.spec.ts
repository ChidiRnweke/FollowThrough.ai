import { afterEach, expect, it } from 'vitest';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import {
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';

const fixtures: ReturnType<typeof workspaceResourcesFixture>[] = [];
afterEach(() => {
	for (const fixture of fixtures.splice(0)) fixture.resources.stop();
});
const setup = async () => {
	const accountId = testActor().userId;
	const fixture = workspaceResourcesFixture(accountId);
	fixtures.push(fixture);
	const user: WorkspaceRecord = {
		type: 'users',
		value: {
			id: accountId,
			email: 'startup@example.test',
			displayName: 'Startup reader',
			role: 'USER',
			createdAt: testNow,
			updatedAt: testNow
		}
	};
	const project: WorkspaceRecord = { type: 'projects', value: projectBuilder({ role: 'inbox' }) };
	fixture.transport.records.set(workspaceResourceKey({ type: 'users', id: [accountId] }), {
		etag: syncEtag(1n),
		value: user
	});
	fixture.transport.records.set(
		workspaceResourceKey({ type: 'projects', id: [project.value.id] }),
		{ etag: syncEtag(1n), value: project }
	);
	await fixture.resources.initialize();
	return { ...fixture, accountId };
};

it('exposes the account shell while the inventory response is still pending', async () => {
	const fixture = await setup();
	const pause = fixture.transport.pause('changes');
	const pull = fixture.cache.refresh();
	await pause.started;
	await fixture.resources.open({ type: 'users', id: [fixture.accountId] });
	const visibleName = fixture.resources.views.shell(fixture.accountId)?.user.displayName;
	pause.release();
	await pull;
	expect(visibleName).toBe('Startup reader');
});

it('does not infer absent preferences from a targeted unavailable response', async () => {
	const fixture = await setup();
	await fixture.resources.open({ type: 'users', id: [fixture.accountId] });
	await fixture.resources.open({ type: 'projects', id: [projectBuilder().id] });
	await fixture.resources.open({ type: 'agent_preferences', id: [fixture.accountId] });
	expect(fixture.resources.startupReadiness).toEqual({ kind: 'loading' });
});

it('permits preference defaults only after the complete inventory proves absence', async () => {
	const fixture = await setup();
	await fixture.resources.requireCollections();
	expect(fixture.resources.startupReadiness).toEqual({ kind: 'ready' });
});
