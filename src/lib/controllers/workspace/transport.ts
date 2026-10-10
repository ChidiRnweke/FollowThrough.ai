import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { SyncReadTransport } from '$lib/controllers/sync/cache';
import type { OutboxTransport } from '$lib/controllers/sync/submission';
export interface WorkspaceReadController {
	pull(
		since: Parameters<SyncReadTransport<WorkspaceRecord>['pull']>[0]
	): ReturnType<SyncReadTransport<WorkspaceRecord>['pull']>;
	read(
		key: string,
		etag: Parameters<SyncReadTransport<WorkspaceRecord>['read']>[1]
	): ReturnType<SyncReadTransport<WorkspaceRecord>['read']>;
}
export class WorkspaceReads implements WorkspaceReadController {
	constructor(
		private readonly transport: SyncReadTransport<WorkspaceRecord>,
		private readonly identity: WorkspaceCommandRules
	) {}
	async pull(since: Parameters<WorkspaceReadController['pull']>[0]) {
		const page = await this.transport.pull(since);
		for (const { key, resource } of page.records)
			if (
				resource.kind === 'found' &&
				this.identity.workspaceResourceKey(
					this.identity.workspaceRecordIdentity(resource.snapshot.value)
				) !== key
			)
				throw new Error('The server page returned a different resource');
		return page;
	}
	async read(key: string, etag: Parameters<WorkspaceReadController['read']>[1]) {
		const result = await this.transport.read(key, etag);
		if (
			result.kind === 'found' &&
			this.identity.workspaceResourceKey(
				this.identity.workspaceRecordIdentity(result.snapshot.value)
			) !== key
		)
			throw new Error('The server returned a different resource');
		return result;
	}
}
export interface WorkspaceWriteController extends OutboxTransport<
	WorkspaceCommand,
	WorkspaceRecord
> {
	readonly recovery: NonNullable<OutboxTransport<WorkspaceCommand, WorkspaceRecord>['recovery']>;
}
export class WorkspaceWrites implements WorkspaceWriteController {
	constructor(
		private readonly transport: WorkspaceWriteController,
		private readonly reads: WorkspaceReadController,
		private readonly identity: WorkspaceCommandRules
	) {}
	readonly recovery: WorkspaceWriteController['recovery'] = {
		observe: async (key) => {
			const response = await this.reads.read(key, null);
			if (response.kind === 'unchanged')
				throw new Error('Conflict review requires a complete server version');
			return response;
		},
		cancel: (input) => this.transport.recovery.cancel(input)
	};
	async send(input: Parameters<WorkspaceWriteController['send']>[0]) {
		const result = await this.transport.send(input);
		if (result.kind === 'applied' && result.receipt.operationId !== input.operationId)
			throw new Error('The server acknowledged a different operation');
		if (result.kind === 'proven' && result.proof.operationId !== input.operationId)
			throw new Error('The server acknowledged a different operation');
		const resource =
			result.kind === 'applied'
				? result.receipt.resource
				: result.kind === 'conflict'
					? result.remote
					: null;
		if (
			resource?.kind === 'found' &&
			this.identity.workspaceResourceKey(
				this.identity.workspaceRecordIdentity(resource.snapshot.value)
			) !== this.identity.workspaceResourceKey(this.identity.mutationResource(input.command))
		)
			throw new Error('The server returned a different resource');
		return result;
	}
}
