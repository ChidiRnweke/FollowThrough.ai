import { afterEach, expect, it } from 'vitest';
import {
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceController } from './workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
/** A fresh device: the server holds the account and its inbox, this tab has downloaded nothing. */
const setup = () => {
	const accountId = testActor().userId;
	const fixture = workspaceFixture({ accountId });
	started.push(fixture.workspace);
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
	const server = fixture.transport.reads;
	server.records.set(workspaceResourceKey({ type: 'users', id: [accountId] }), {
		etag: syncEtag(1n),
		value: user
	});
	server.records.set(workspaceResourceKey({ type: 'projects', id: [project.value.id] }), {
		etag: syncEtag(1n),
		value: project
	});
	/** The inventory download stays open until the test releases it. */
	const inventory = server.pause('changes');
	return { ...fixture, accountId, inventory };
};

it('exposes the account shell while the inventory response is still pending', async () => {
	const fixture = setup();
	const resources = await fixture.start();
	void resources.synchronize();
	await fixture.inventory.started;
	await resources.open({ type: 'users', id: [fixture.accountId] });
	const visibleName = fixture.views.shell(fixture.accountId)?.user.displayName;
	fixture.inventory.release();
	expect(visibleName).toBe('Startup reader');
});

it('does not infer absent preferences from a targeted unavailable response', async () => {
	const fixture = setup();
	const resources = await fixture.start();
	void resources.synchronize();
	await fixture.inventory.started;
	await resources.open({ type: 'users', id: [fixture.accountId] });
	await resources.open({ type: 'projects', id: [projectBuilder().id] });
	await resources.open({ type: 'agent_preferences', id: [fixture.accountId] });
	const readiness = resources.startupReadiness;
	fixture.inventory.release();
	expect(readiness).toEqual({ kind: 'loading' });
});

it('permits preference defaults only after the complete inventory proves absence', async () => {
	const fixture = setup();
	const resources = await fixture.start();
	fixture.inventory.release();
	await resources.requireCollections();
	expect(resources.startupReadiness).toEqual({ kind: 'ready' });
});
