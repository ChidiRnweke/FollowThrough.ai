import { workspaceWriteRejection } from '$lib/server/repositories/workspace/write-failure';
import { DomainError, ValidationError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import {
	type WorkspaceMutationRequest,
	type WorkspaceMutationResult,
	type WorkspaceMutationPreparation,
	type WorkspaceWriteCancellation,
	type WorkspaceWriteRecovery
} from '$lib/models/workspace-mutations';
import type { WorkspaceWriteReceipt } from '$lib/models/workspace-records';
import type { SyncObjectRepository } from '$lib/server/repositories/workspace/sync-objects';
import type { SyncReceiptRepository } from '$lib/server/repositories/workspace/sync-receipts';

export interface WorkspaceMutationReceiptDependencies {
	mutationReceipts: SyncReceiptRepository;
	syncObjects: SyncObjectRepository;
}

/** Version guards and durable receipts. The calling controller owns the enclosing transaction. */
export class WorkspaceMutationReceipts {
	constructor(private readonly dependencies: WorkspaceMutationReceiptDependencies) {}

	async cancel(
		actor: ActorContext,
		input: WorkspaceWriteCancellation
	): Promise<WorkspaceWriteRecovery> {
		await this.dependencies.mutationReceipts.lockOperation(actor, input.operationId);
		const previous = await this.dependencies.mutationReceipts.find(
			actor,
			input.operationId,
			input.request
		);
		if (previous.kind === 'reused')
			throw new ValidationError('The operation ID was already used for different input');
		if (previous.kind === 'proven') return previous;
		if (previous.kind === 'missing')
			await this.dependencies.mutationReceipts.cancel(actor, input.operationId, input.request);
		return { kind: 'cancelled' };
	}

	async prepare(
		actor: ActorContext,
		input: WorkspaceMutationRequest,
		identity: WorkspaceResourceIdentity
	): Promise<WorkspaceMutationPreparation> {
		await this.dependencies.mutationReceipts.lockOperation(actor, input.operationId);
		const previous = await this.dependencies.mutationReceipts.find(
			actor,
			input.operationId,
			JSON.stringify(input)
		);
		if (previous.kind === 'reused')
			throw new ValidationError('The operation ID was already used for different input');
		if (previous.kind === 'cancelled')
			return {
				kind: 'finished',
				result: { kind: 'rejected', message: 'This edit was cancelled on this device.' }
			};
		if (previous.kind === 'proven') {
			const resource = await this.dependencies.syncObjects.read(actor, identity, null);
			const etag =
				resource.kind === 'found'
					? resource.snapshot.etag
					: resource.kind === 'deleted'
						? resource.etag
						: null;
			return {
				kind: 'finished',
				result:
					resource.kind === previous.proof.resourceKind &&
					etag === previous.proof.etag &&
					(resource.kind === 'found' || resource.kind === 'deleted')
						? { kind: 'applied', receipt: { operationId: input.operationId, resource } }
						: previous
			};
		}
		await this.dependencies.mutationReceipts.lockResource(actor, identity);
		const current = await this.dependencies.syncObjects.read(actor, identity, null);
		if (current.kind === 'unchanged')
			throw new Error('An unconditional resource read returned no body');
		const matches =
			input.baseEtag === null
				? current.kind !== 'found'
				: current.kind === 'found' && current.snapshot.etag === input.baseEtag;
		return matches
			? { kind: 'ready', current }
			: { kind: 'finished', result: { kind: 'conflict', remote: current } };
	}

	async complete(
		actor: ActorContext,
		input: WorkspaceMutationRequest,
		identity: WorkspaceResourceIdentity
	): Promise<WorkspaceMutationResult> {
		await this.dependencies.mutationReceipts.publishChanges();
		const resource = await this.dependencies.syncObjects.read(actor, identity, null);
		if (resource.kind !== 'found' && resource.kind !== 'deleted')
			throw new Error('The mutation produced no authoritative resource');
		const receipt: WorkspaceWriteReceipt = { operationId: input.operationId, resource };
		await this.dependencies.mutationReceipts.save(actor, JSON.stringify(input), receipt);
		return { kind: 'applied', receipt };
	}

	reject(error: Error): WorkspaceMutationResult {
		if (error instanceof DomainError) return { kind: 'rejected', message: error.message };
		const rejection = workspaceWriteRejection(error);
		if (rejection) return { kind: 'rejected', message: rejection };
		throw error;
	}
}
