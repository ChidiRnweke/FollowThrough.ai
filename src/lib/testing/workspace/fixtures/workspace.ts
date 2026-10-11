import { WorkspaceStorageService } from '$lib/client/services/workspace/storage';
import { LocalStorageBootstrap } from '$lib/client/repositories/workspace/bootstrap';
import { createWorkspaceGraph } from '$lib/factories/workspace/session';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceReplicaRepository } from '$lib/client/repositories/workspace/replica';
import { InMemoryWorkspaceReplica } from '../fakes/in-memory-replica';
import { InMemoryWorkspaceTransport } from '../fakes/in-memory-transport';
import { InMemoryWorkspaceEnvironment } from '../fakes/in-memory-environment.svelte';

export const testWorkspaceAccount = 'a0000000-0000-4000-8000-000000000002';

export const testBootstrap = (accountId = testWorkspaceAccount): WorkspaceBootstrap => ({
	accountId: accountId as WorkspaceBootstrap['accountId'],
	numericDefaults: { webSearchMaxResults: 5, webSearchMaxTotalResults: 10, agentMaxTurns: 10 },
	agentDefaults: { chatModelId: 'provider/chat', visionModelId: 'provider/vision' },
	agentModels: [],
	agentAvailable: false
});

/** A browser storage area that lives as long as the test. */
const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key)
	};
};

/** One browser tab of an account over the given device storage, server and writer locks. */
export const workspaceTab = (
	accountId: string,
	replica: WorkspaceReplicaRepository<WorkspaceCommand, WorkspaceRecord>,
	transport: InMemoryWorkspaceTransport,
	locks: Map<string, Promise<void>>
) => {
	const environment = new InMemoryWorkspaceEnvironment(accountId, locks);
	const values = memoryStorage();
	const storage = new WorkspaceStorageService(replica, new LocalStorageBootstrap(() => values));
	storage.saveBootstrap(testBootstrap(accountId));
	const { workspace, views } = createWorkspaceGraph(storage, transport, environment);
	/** Starts the account offline, then reports connectivity as the test asks. */
	const start = async (online = true) => {
		environment.online = false;
		const session = await workspace.start();
		environment.online = online;
		session.resources.setOnline(online);
		return session.resources;
	};
	return { environment, browserStorage: values, storage, workspace, views, start };
};

/**
 * A complete workspace over in-memory storage, server and tab. The account starts with its
 * deployment settings saved and the tab offline, so nothing is fetched until a test goes online.
 */
export const workspaceFixture = (
	options: {
		readonly accountId?: string;
		readonly replica?: InMemoryWorkspaceReplica<WorkspaceCommand, WorkspaceRecord>;
		readonly transport?: InMemoryWorkspaceTransport;
		/** Another tab of the same browser shares the writer lock. */
		readonly locks?: Map<string, Promise<void>>;
	} = {}
) => {
	const accountId = options.accountId ?? testWorkspaceAccount;
	const replica =
		options.replica ?? new InMemoryWorkspaceReplica<WorkspaceCommand, WorkspaceRecord>();
	const transport = options.transport ?? new InMemoryWorkspaceTransport();
	const locks = options.locks ?? new Map<string, Promise<void>>();
	/** Another tab of this browser: the same storage, server and writer lock. */
	const tab = () => workspaceFixture({ accountId, replica, transport, locks });
	return {
		accountId,
		replica,
		transport,
		...workspaceTab(accountId, replica, transport, locks),
		tab
	};
};
