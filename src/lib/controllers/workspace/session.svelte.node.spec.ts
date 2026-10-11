import { afterEach, describe, expect, it } from 'vitest';
import { workspaceBootstrapKey } from '$lib/models/workspace-bootstrap';
import type { WorkspaceController } from './workspace';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { replicaProject } from '$lib/testing/workspace/fixtures/replica-records';
import { testBootstrap, workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';

const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

/** A tab of a signed-in account; `fresh` means it has no saved deployment settings yet. */
const setup = (fresh = false) => {
	const fixture = workspaceFixture({ accountId: projectBuilder().userId });
	started.push(fixture.workspace);
	fixture.transport.bootstrapped = testBootstrap(fixture.accountId);
	if (fresh) fixture.storage.clearBootstrap();
	return fixture;
};
const failure = (error: Error) => ({ kind: 'failure' as const, message: error.message });

describe('workspace account lifetime', () => {
	it('shares startup across callers for the active account', async () => {
		const { workspace } = setup();
		const first = workspace.start();
		const second = workspace.start();
		const session = await first;
		expect({ sameStart: first === second, sameSession: workspace.current === session }).toEqual({
			sameStart: true,
			sameSession: true
		});
	});
	it('does not publish or persist deployment settings fetched after the account stops', async () => {
		const { workspace, transport, storage, accountId } = setup(true);
		const gate = transport.pauseBootstrap();
		const starting = workspace.start().catch(failure);
		await gate.started;
		workspace.stop();
		gate.release();
		expect({
			result: await starting,
			current: workspace.current,
			saved: storage.readBootstrap(accountId)
		}).toEqual({
			result: { kind: 'failure', message: 'The workspace account changed while opening' },
			current: null,
			saved: { kind: 'absent' }
		});
	});
	it('rejects deployment settings belonging to a replaced account binding', async () => {
		const { workspace, transport, environment } = setup(true);
		const gate = transport.pauseBootstrap();
		const starting = workspace.start().catch(failure);
		await gate.started;
		environment.accountId = 'another-account';
		gate.release();
		expect(await starting).toEqual({
			kind: 'failure',
			message: 'The workspace account changed while opening'
		});
	});
	it('closes the old workspace and reloads when synchronization observes another account', async () => {
		const { workspace, environment } = setup();
		const { resources } = await workspace.start();
		environment.accountId = 'another-account';
		const result = await workspace.synchronize();
		expect({
			result,
			current: workspace.current,
			active: resources.active,
			reloads: environment.reloads
		}).toEqual({ result: { kind: 'stopped' }, current: null, active: false, reloads: 1 });
	});
	it('clears startup data and detaches browser events on sign out', async () => {
		const { workspace, environment, storage, accountId } = setup();
		const { resources } = await workspace.start();
		workspace.signOut();
		environment.accountId = null;
		for (const events of environment.events) events.refresh();
		expect({
			current: workspace.current,
			active: resources.active,
			stored: storage.readBootstrap(accountId),
			listeners: environment.events.length,
			reloads: environment.reloads
		}).toEqual({
			current: null,
			active: false,
			stored: { kind: 'absent' },
			listeners: 0,
			reloads: 0
		});
	});
	it('resets only the bound account after stopping its session', async () => {
		const { workspace, replica, accountId } = setup();
		const project = replicaProject(1, 'Saved here');
		const stored = [
			{ key: project.key, entry: { kind: 'present' as const, snapshot: project.at(1n) } }
		];
		replica.seed(accountId, stored);
		replica.seed('other', stored);
		const { resources } = await workspace.start();
		await workspace.resetLocalWorkspace();
		expect({
			bound: replica.resource(accountId, project.key),
			other: replica.resource('other', project.key)?.kind,
			active: resources.active,
			current: workspace.current
		}).toEqual({ bound: undefined, other: 'present', active: false, current: null });
	});
	it('reports corrupt offline startup data instead of constructing an empty workspace', async () => {
		const { workspace, environment, browserStorage } = setup();
		environment.online = false;
		browserStorage.setItem(workspaceBootstrapKey, '{');
		await expect(workspace.start()).rejects.toThrow(
			'Saved startup settings could not be read. Reconnect to restore them; saved edits remain on this device.'
		);
	});
});
