import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { describe, expect, it } from 'vitest';
import { WorkspaceSessions } from './session';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import {
	InMemoryWorkspaceSessionEnvironment,
	InMemoryWorkspaceRecovery
} from '$lib/testing/sync/fakes/in-memory-session';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';

const setup = () => {
	const accountId = projectBuilder().userId;
	const bootstrap: WorkspaceBootstrap = {
		accountId,
		agentDefaults: { chatModelId: 'provider/chat', visionModelId: 'provider/vision' },
		agentModels: [],
		numericDefaults: { webSearchMaxResults: 5, webSearchMaxTotalResults: 10, agentMaxTurns: 10 },
		agentAvailable: false
	};
	const environment = new InMemoryWorkspaceSessionEnvironment(bootstrap);
	const recovery = new InMemoryWorkspaceRecovery();
	const { resources } = workspaceResourcesFixture(accountId);
	const controller = new WorkspaceSessions(
		new WorkspaceSessionStore(),
		environment,
		{ create: () => resources },
		recovery,
		agentRulesFixture()
	);
	return { controller, environment, recovery, resources, accountId };
};

describe('workspace account lifetime', () => {
	it('shares startup across callers for the active account', async () => {
		const { controller } = setup();
		const first = controller.start();
		const second = controller.start();
		const session = await first;
		const current = controller.current;
		controller.stop();
		expect({ sameStart: first === second, sameSession: current === session }).toEqual({
			sameStart: true,
			sameSession: true
		});
	});
	it('does not publish or persist bootstrap fetched after account stop', async () => {
		const { controller, environment } = setup();
		const gate = environment.pauseBootstrap();
		const starting = controller
			.start()
			.catch((error: Error) => ({ kind: 'failure' as const, message: error.message }));
		await gate.started;
		controller.stop();
		gate.release();
		const result = await starting;
		expect({ result, current: controller.current, saved: environment.saved }).toEqual({
			result: { kind: 'failure', message: 'The workspace account changed while opening' },
			current: null,
			saved: null
		});
	});
	it('rejects bootstrap belonging to a replaced account binding', async () => {
		const { controller, environment } = setup();
		const gate = environment.pauseBootstrap();
		const starting = controller
			.start()
			.catch((error: Error) => ({ kind: 'failure' as const, message: error.message }));
		await gate.started;
		environment.accountId = 'another-account';
		gate.release();
		expect(await starting).toEqual({
			kind: 'failure',
			message: 'The workspace account changed while opening'
		});
	});
	it('closes the old workspace and reloads when synchronization observes another account', async () => {
		const { controller, environment, resources } = setup();
		await controller.start();
		environment.accountId = 'another-account';
		const result = await controller.synchronize();
		expect({
			result,
			current: controller.current,
			active: resources.active,
			reloaded: environment.reloaded
		}).toEqual({ result: { kind: 'stopped' }, current: null, active: false, reloaded: true });
	});
	it('clears startup data and detaches browser events on sign out', async () => {
		const { controller, environment, resources } = setup();
		await controller.start();
		controller.signOut();
		environment.accountId = null;
		environment.focus();
		expect({
			current: controller.current,
			active: resources.active,
			stored: environment.stored,
			reloaded: environment.reloaded
		}).toEqual({ current: null, active: false, stored: { kind: 'absent' }, reloaded: false });
	});
	it('resets only the bound account after stopping its session', async () => {
		const { controller, recovery, resources, accountId } = setup();
		recovery.accounts.set(accountId, new Blob(['local edits']));
		recovery.accounts.set('other', new Blob(['other edits']));
		await controller.start();
		await controller.resetLocalWorkspace();
		expect({
			accounts: [...recovery.accounts.keys()],
			active: resources.active,
			current: controller.current
		}).toEqual({ accounts: ['other'], active: false, current: null });
	});
	it('reports corrupt offline startup data instead of constructing an empty workspace', async () => {
		const { controller, environment } = setup();
		environment.online = false;
		environment.stored = { kind: 'corrupt', message: 'Invalid saved data' };
		await expect(controller.start()).rejects.toThrow(
			'Saved startup settings could not be read. Reconnect to restore them; saved edits remain on this device.'
		);
	});
});
