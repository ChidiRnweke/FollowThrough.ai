import type { ArtifactId } from '$lib/models/deliverables';
import type { ArtifactActionStore } from '$lib/stores/deliverables/artifacts.svelte';
import type {
	DeliverableAccount,
	DeliverableSession,
	DeliverableEnvironment,
	DeliverableOperation
} from '$lib/models/browser-deliverables';
import type { WorkspaceCapabilityRegistry } from '$lib/stores/workspace/capabilities';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	initialSyncCursor,
	type SynchronizationResult,
	type SyncPage,
	type CachedRecord
} from '$lib/models/sync';
import type { ICacheCommitService } from '$lib/services/sync/state';
import type {
	ArtifactActionsRemote,
	ArtifactDownloadNavigation
} from '$lib/models/browser-deliverables';
export type {
	ArtifactActionsRemote,
	ArtifactDownloadNavigation
} from '$lib/models/browser-deliverables';
export interface ArtifactDependencies {
	readonly session: DeliverableSession;
	readonly environment: DeliverableEnvironment;
	readonly accounts: WorkspaceCapabilityRegistry<DeliverableAccount>;
	readonly cacheMerge: ICacheCommitService;
	readonly remote: ArtifactActionsRemote;
	readonly navigation: ArtifactDownloadNavigation;
}
export type ArtifactActionOutcome =
	| { readonly kind: 'complete' | 'superseded' }
	| { readonly kind: 'failure'; readonly message: string };
export interface ArtifactActionsController {
	busy(id: ArtifactId): boolean;
	download(id: ArtifactId): Promise<ArtifactActionOutcome>;
	regenerate(id: ArtifactId): Promise<ArtifactActionOutcome>;
	remove(id: ArtifactId): Promise<ArtifactActionOutcome>;
	close(): void;
}
export class ArtifactActions implements ArtifactActionsController {
	constructor(
		private readonly state: ArtifactActionStore,
		private readonly dependencies: ArtifactDependencies
	) {}
	busy(id: ArtifactId): boolean {
		return this.state.busy(id);
	}
	download(id: ArtifactId): Promise<ArtifactActionOutcome> {
		return this.perform(id, 'Could not prepare the download.', async (current) => {
			const result = await this.dependencies.remote.download(id);
			if (current()) this.dependencies.navigation.assign(result.url);
		});
	}
	regenerate(id: ArtifactId): Promise<ArtifactActionOutcome> {
		return this.perform(id, 'Could not regenerate the document.', async (current, operation) => {
			const result = await this.dependencies.remote.regenerate(id);
			if (!current()) return;
			this.dependencies.navigation.assign(result.downloadUrl);
			await this.synchronize(operation);
		});
	}
	remove(id: ArtifactId): Promise<ArtifactActionOutcome> {
		return this.perform(id, 'Could not delete the artifact.', async (current, operation) => {
			await this.dependencies.remote.delete(id);
			if (current()) await this.synchronize(operation);
		});
	}

	private async perform(
		id: ArtifactId,
		failure: string,
		work: (current: () => boolean, operation: DeliverableOperation) => Promise<void>
	): Promise<ArtifactActionOutcome> {
		if (this.state.closed || this.busy(id)) return { kind: 'superseded' };
		const token = Symbol();
		let operation: DeliverableOperation | undefined;
		this.state.begin(id, token);
		try {
			operation = this.capture(this.state.generation);
			const captured = operation;
			await work(() => this.current(captured), operation);
			return { kind: this.current(operation) ? 'complete' : 'superseded' };
		} catch (error) {
			if (this.state.closed || (operation && !this.current(operation)))
				return { kind: 'superseded' };
			return {
				kind: 'failure',
				message: error instanceof Error ? `${failure} ${error.message}` : failure
			};
		} finally {
			this.state.finish(token);
		}
	}
	close(): void {
		this.state.close();
	}

	private capture(generation: number): DeliverableOperation {
		const binding = this.dependencies.session.resourceBinding;
		if (!binding) throw new Error('The workspace is not open.');
		const operation = {
			binding,
			account: this.dependencies.accounts.get(binding.resourceKey),
			generation
		};
		this.requireCurrent(operation);
		return operation;
	}
	private current(operation: DeliverableOperation): boolean {
		const binding = this.dependencies.session.resourceBinding;
		return (
			operation.generation === this.state.generation &&
			binding !== null &&
			binding.accountId === operation.binding.accountId &&
			binding.resourceKey === operation.binding.resourceKey &&
			binding.generation === operation.binding.generation &&
			this.dependencies.environment.accountId === binding.accountId &&
			operation.account.accountId === binding.accountId &&
			!operation.account.cacheState.read().stopped
		);
	}
	private requireCurrent(operation: DeliverableOperation): void {
		if (!this.current(operation))
			throw new Error('The workspace or view changed. Close this view and try again.');
	}
	private async synchronize(operation: DeliverableOperation): Promise<void> {
		this.requireCurrent(operation);
		const { cacheState } = operation.account;
		const previous = cacheState.read().checking;
		if (previous) {
			await previous;
			this.requireCurrent(operation);
		}
		// A pass started before the mutation cannot establish its result. Join only a subsequent pass.
		let checking = cacheState.read().checking;
		if (!checking || checking === previous) {
			checking = this.pull(operation).finally(() => {
				if (cacheState.read().checking === checking) cacheState.update({ checking: null });
			});
			cacheState.update({ checking });
		}
		const result = await checking;
		this.requireCurrent(operation);
		if (result.kind !== 'complete')
			throw new Error(
				result.kind === 'failure' ? result.message : `Workspace synchronization is ${result.kind}.`
			);
	}
	private async pull(operation: DeliverableOperation): Promise<SynchronizationResult> {
		try {
			if (!this.dependencies.environment.online) return { kind: 'offline' };
			const { account, binding } = operation;
			let stored = await account.cacheStorage.load(binding.accountId);
			this.requireCurrent(operation);
			let more: boolean;
			do {
				this.requireCurrent(operation);
				if (!this.dependencies.environment.online) return { kind: 'offline' };
				const before = stored.cursor ?? initialSyncCursor;
				const page = await account.readTransport.pull(before);
				this.requireCurrent(operation);
				if (
					BigInt(page.cursor) < BigInt(before) ||
					(page.hasMore && BigInt(page.cursor) === BigInt(before))
				)
					throw new Error('The server page did not advance its checkpoint');
				await this.commitPage(operation, page);
				stored = await account.cacheStorage.load(binding.accountId);
				this.requireCurrent(operation);
				more = page.hasMore;
			} while (more);
			return { kind: 'complete' };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Workspace synchronization failed'
			};
		}
	}
	private async commitPage(
		operation: DeliverableOperation,
		page: SyncPage<WorkspaceRecord>
	): Promise<void> {
		const put: CachedRecord<WorkspaceRecord>[] = page.records.map(({ key, resource }) => ({
			key,
			entry: resource.kind === 'found' ? { kind: 'present', snapshot: resource.snapshot } : resource
		}));
		await operation.account.cacheStorage.transaction(operation.binding.accountId, async (tx) => {
			this.requireCurrent(operation);
			const previous = await tx.resources(put.map((row) => row.key));
			const checkpoint = await tx.checkpoint();
			this.requireCurrent(operation);
			const decision = this.dependencies.cacheMerge.decide(previous, checkpoint, {
				put,
				remove: [],
				cursor: page.cursor,
				inventoryComplete: !page.hasMore
			});
			await tx.put(decision.put);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
			this.requireCurrent(operation);
		});
	}
}
