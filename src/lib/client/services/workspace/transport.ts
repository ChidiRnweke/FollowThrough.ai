import { z } from 'zod';
import { readWorkspaceBootstrap } from '$lib/remote/workspace/bootstrap.remote';
import { pullWorkspaceChangePage, readWorkspaceResource } from '$lib/remote/workspace/sync.remote';
import {
	cancelWorkspaceMutation,
	pushWorkspaceMutation
} from '$lib/remote/workspace/mutations.remote';
import { workspaceBootstrapSchema, type WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import {
	syncPageSchema,
	type SyncCursor,
	type SyncEtag,
	type SyncObjectRead,
	type SyncPage
} from '$lib/models/sync';
import type { WriteOutcome, WriteRecovery } from '$lib/models/outbox';
import { workspaceResourceIdentitySchema } from '$lib/models/workspace-sync';
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

export class RemoteWorkspaceTransport implements WorkspaceTransport {
	async bootstrap(): Promise<WorkspaceBootstrap> {
		return workspaceBootstrapSchema.parse(await readWorkspaceBootstrap({}));
	}
	async pull(accountId: string, since: SyncCursor): Promise<SyncPage<WorkspaceRecord>> {
		return syncPageSchema(workspaceRecordSchema).parse(
			await pullWorkspaceChangePage({ accountId, since })
		);
	}
	async read(
		accountId: string,
		key: string,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>> {
		const [type, ...id] = z.array(z.string()).min(2).parse(JSON.parse(key));
		const identity = workspaceResourceIdentitySchema.parse({ type, id });
		return workspaceObjectReadSchema.parse(
			await readWorkspaceResource({ accountId, identity, etag })
		);
	}
	async send(
		accountId: string,
		input: WorkspaceSubmission
	): Promise<WriteOutcome<WorkspaceRecord>> {
		return workspaceMutationResultSchema.parse(
			await pushWorkspaceMutation({ ...input, accountId })
		);
	}
	async cancel(
		accountId: string,
		input: WorkspaceSubmission
	): Promise<WriteRecovery<WorkspaceRecord>> {
		return workspaceWriteRecoverySchema.parse(
			await cancelWorkspaceMutation({
				operationId: input.operationId,
				request: JSON.stringify(input),
				accountId
			})
		);
	}
}
