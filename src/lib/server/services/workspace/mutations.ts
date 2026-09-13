import type { WorkspaceWriteCancellation } from '$lib/models/workspace-mutations';
import { DomainError, ValidationError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { AtomicOperation } from '$lib/models/workspace';
import {
	mutationResource,
	type WorkspaceMutationRequest,
	type WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceRecord, WorkspaceWriteReceipt } from '$lib/models/workspace-records';
import type { SyncObjectRead } from '$lib/models/sync';
import type { SyncObjectRepository } from '$lib/server/repositories/workspace/sync-objects';
import type { SyncReceiptRepository } from '$lib/server/repositories/workspace/sync-receipts';
import type { WorkspaceWriteRecovery } from '$lib/models/workspace-mutations';

export interface SyncMutationDependencies {
	retry?: 'database-only' | 'never';
	mutationReceipts: SyncReceiptRepository;
	syncObjects: SyncObjectRepository;
	transactionRunner: AtomicOperation;
}

/** Reuses the ordinary controller operations inside one guarded, receipted transaction. */
export class SyncMutationTransactions {
	constructor(private readonly dependencies: SyncMutationDependencies) {}
	cancel(actor: ActorContext, input: WorkspaceWriteCancellation): Promise<WorkspaceWriteRecovery> {
		return this.dependencies.transactionRunner.run(
			async () => {
				const request = input.request;
				await this.dependencies.mutationReceipts.lockOperation(actor, input.operationId);
				const previous = await this.dependencies.mutationReceipts.find(
					actor,
					input.operationId,
					request
				);
				if (previous.kind === 'reused')
					throw new ValidationError('The operation ID was already used for different input');
				if (previous.kind === 'receipt') return { kind: 'applied', receipt: previous.receipt };
				if (previous.kind === 'compacted') return previous;
				if (previous.kind === 'missing')
					await this.dependencies.mutationReceipts.cancel(actor, input.operationId, request);
				return { kind: 'cancelled' };
			},
			{ retry: 'database-only' }
		);
	}
	acknowledge(actor: ActorContext, operationId: string): Promise<void> {
		return this.dependencies.transactionRunner.run(
			async () => {
				await this.dependencies.mutationReceipts.lockOperation(actor, operationId);
				await this.dependencies.mutationReceipts.compact(actor, operationId);
			},
			{ retry: 'database-only' }
		);
	}
	async run(
		actor: ActorContext,
		input: WorkspaceMutationRequest,
		execute: (current: SyncObjectRead<WorkspaceRecord>) => Promise<void>
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const identity = mutationResource(input.command);
					const request = JSON.stringify(input);
					await this.dependencies.mutationReceipts.lock(actor, input.operationId, identity);
					const previous = await this.dependencies.mutationReceipts.find(
						actor,
						input.operationId,
						request
					);
					if (previous.kind === 'reused')
						throw new ValidationError('The operation ID was already used for different input');
					if (previous.kind === 'receipt') return { kind: 'applied', receipt: previous.receipt };
					if (previous.kind === 'cancelled')
						return { kind: 'rejected', message: 'This edit was cancelled on this device.' };
					if (previous.kind === 'compacted') return previous;
					const current = await this.dependencies.syncObjects.read(actor, identity, null);
					if (current.kind === 'unchanged')
						throw new Error('An unconditional resource read returned no body');
					const matches =
						input.baseEtag === null
							? current.kind !== 'found'
							: current.kind === 'found' && current.snapshot.etag === input.baseEtag;
					if (!matches) return { kind: 'conflict', remote: current };
					await execute(current);
					await this.dependencies.mutationReceipts.publishChanges();
					const resource = await this.dependencies.syncObjects.read(actor, identity, null);
					if (resource.kind !== 'found' && resource.kind !== 'deleted')
						throw new Error('The mutation produced no authoritative resource');
					const receipt: WorkspaceWriteReceipt = { operationId: input.operationId, resource };
					await this.dependencies.mutationReceipts.save(actor, request, receipt);
					return { kind: 'applied', receipt };
				},
				{ retry: this.dependencies.retry ?? 'never' }
			);
		} catch (error) {
			if (error instanceof DomainError) return { kind: 'rejected', message: error.message };
			throw error;
		}
	}
}
