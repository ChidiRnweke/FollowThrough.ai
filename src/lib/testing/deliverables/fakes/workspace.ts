import type { DeliverableAccount, DeliverableSession } from '$lib/models/browser-deliverables';
import type {
	WorkspaceEditingEnvironment,
	WorkspaceResourceBinding
} from '$lib/models/browser-workspace';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { DateTime } from '$lib/models/workspace';
import { ResourceCacheStore } from '$lib/stores/sync/cache';
import { WorkspaceCapabilityStore } from '$lib/stores/workspace/capabilities';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { InMemoryOutbox } from '$lib/testing/sync/fakes/in-memory-outbox';
import { rebaseWorkspaceRecord } from '$lib/factories/workspace/rebase';
export class InMemoryDeliverableWorkspace implements DeliverableSession {
	generation = 0;
	resourceBinding: WorkspaceResourceBinding | null;
	readonly environment: { accountId: string | null; online: boolean };
	readonly cache = new InMemorySyncCache<WorkspaceRecord>();
	readonly repository = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(
		rebaseWorkspaceRecord,
		this.cache
	);
	readonly transport = new InMemorySyncTransport<WorkspaceRecord>();
	readonly cacheState = new ResourceCacheStore<WorkspaceRecord>();
	readonly accounts = new WorkspaceCapabilityStore<DeliverableAccount>();
	constructor(readonly accountId: string) {
		this.environment = { accountId, online: true };
		this.resourceBinding = { accountId, generation: 0, resourceKey: {} };
		this.accounts.set(this.resourceBinding.resourceKey, this.account(accountId));
	}
	private account(accountId: string): DeliverableAccount {
		return {
			accountId,
			repository: this.repository,
			outbox: this.repository,
			cacheStorage: this.cache,
			readTransport: this.transport,
			cacheState: this.cacheState
		};
	}
	stop(): void {
		this.generation++;
		this.resourceBinding = null;
	}
	replace(accountId = this.accountId): void {
		this.generation++;
		this.environment.accountId = accountId;
		this.resourceBinding = { accountId, generation: this.generation, resourceKey: {} };
		this.accounts.set(this.resourceBinding.resourceKey, this.account(accountId));
	}
}
export class InMemoryExportEnvironment implements WorkspaceEditingEnvironment {
	now(): DateTime {
		return '2026-10-11T00:00:00.000Z' as DateTime;
	}
	operationId(): string {
		return crypto.randomUUID();
	}
	snapshot<T>(value: T): T {
		return structuredClone(value);
	}
	observe(start: () => void): () => void {
		return start;
	}
}
