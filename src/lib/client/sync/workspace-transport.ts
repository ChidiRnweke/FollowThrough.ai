import { z } from 'zod';
import { syncChangesSchema } from '$lib/models/sync';
import { workspaceResourceIdentitySchema } from '$lib/models/workspace-sync';
import { workspaceObjectReadSchema, type WorkspaceRecord } from '$lib/models/workspace-records';
import { pullWorkspaceChanges, readWorkspaceResource } from '$lib/remote/workspace/sync.remote';
import {
	workspaceMutationResultSchema,
	type WorkspaceCommand
} from '$lib/models/workspace-mutations';
import { pushWorkspaceMutation } from '$lib/remote/workspace/mutations.remote';
import type { OutboxTransport } from './outbox-contracts';
import type { SyncReadTransport } from './contracts';

const identityFromKey = (key: string) => {
	const [type, ...id] = z.array(z.string()).min(2).parse(JSON.parse(key));
	return workspaceResourceIdentitySchema.parse({ type, id });
};

/** Remote-query memoization never substitutes for this protocol's authoritative network read. */
export const workspaceReadTransport = (accountId: string): SyncReadTransport<WorkspaceRecord> => ({
	async pull(since) {
		const request = pullWorkspaceChanges({ accountId, since });
		await request.refresh();
		return syncChangesSchema.parse(await request);
	},
	async read(key, etag) {
		const request = readWorkspaceResource({ accountId, identity: identityFromKey(key), etag });
		await request.refresh();
		return workspaceObjectReadSchema.parse(await request);
	}
});

export const workspaceWriteTransport = (
	accountId: string
): OutboxTransport<WorkspaceCommand, WorkspaceRecord> => ({
	async send(input) {
		return workspaceMutationResultSchema.parse(
			await pushWorkspaceMutation({ ...input, accountId })
		);
	}
});
