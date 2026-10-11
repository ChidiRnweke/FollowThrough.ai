import { z } from 'zod';
import { workspaceBootstrapSchema, type WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import {
	syncPageSchema,
	type SyncCursor,
	type SyncEtag,
	type SyncObjectRead,
	type SyncPage
} from '$lib/models/sync';
import type { WriteOutcome, WriteRecovery } from '$lib/models/outbox';
import {
	workspaceResourceIdentitySchema,
	type WorkspaceResourceIdentity
} from '$lib/models/workspace-sync';
import {
	workspaceObjectReadSchema,
	workspaceRecordSchema,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	workspaceMutationResultSchema,
	workspaceWriteRecoverySchema,
	type WorkspaceCommand
} from '$lib/models/workspace-mutations';

export interface WorkspaceSubmission {
	readonly operationId: string;
	readonly baseEtag: SyncEtag | null;
	readonly command: WorkspaceCommand;
}

/** The server's workspace synchronization functions, with their responses parsed. */
export interface WorkspaceTransport {
	bootstrap(): Promise<WorkspaceBootstrap>;
	pull(accountId: string, since: SyncCursor): Promise<SyncPage<WorkspaceRecord>>;
	read(
		accountId: string,
		key: string,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
	send(accountId: string, input: WorkspaceSubmission): Promise<WriteOutcome<WorkspaceRecord>>;
	cancel(accountId: string, input: WorkspaceSubmission): Promise<WriteRecovery<WorkspaceRecord>>;
}

/** The server's remote functions as they answer: unparsed until this service reads them. */
export interface WorkspaceRemoteFunctions {
	bootstrap(): Promise<unknown>;
	pull(input: { accountId: string; since: SyncCursor }): Promise<unknown>;
	read(input: {
		accountId: string;
		identity: WorkspaceResourceIdentity;
		etag: SyncEtag | null;
	}): Promise<unknown>;
	push(input: WorkspaceSubmission & { accountId: string }): Promise<unknown>;
	cancel(input: { operationId: string; request: string; accountId: string }): Promise<unknown>;
}

export class RemoteWorkspaceTransport implements WorkspaceTransport {
	constructor(private readonly remote: WorkspaceRemoteFunctions) {}
	async bootstrap(): Promise<WorkspaceBootstrap> {
		return workspaceBootstrapSchema.parse(await this.remote.bootstrap());
	}
	async pull(accountId: string, since: SyncCursor): Promise<SyncPage<WorkspaceRecord>> {
		return syncPageSchema(workspaceRecordSchema).parse(
			await this.remote.pull({ accountId, since })
		);
	}
	async read(
		accountId: string,
		key: string,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>> {
		const [type, ...id] = z.array(z.string()).min(2).parse(JSON.parse(key));
		const identity = workspaceResourceIdentitySchema.parse({ type, id });
		return workspaceObjectReadSchema.parse(await this.remote.read({ accountId, identity, etag }));
	}
	async send(
		accountId: string,
		input: WorkspaceSubmission
	): Promise<WriteOutcome<WorkspaceRecord>> {
		return workspaceMutationResultSchema.parse(await this.remote.push({ ...input, accountId }));
	}
	async cancel(
		accountId: string,
		input: WorkspaceSubmission
	): Promise<WriteRecovery<WorkspaceRecord>> {
		return workspaceWriteRecoverySchema.parse(
			await this.remote.cancel({
				operationId: input.operationId,
				request: JSON.stringify(input),
				accountId
			})
		);
	}
}
