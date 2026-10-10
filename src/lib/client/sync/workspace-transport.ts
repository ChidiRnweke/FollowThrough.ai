import { z } from 'zod';
import { workspaceBootstrapSchema } from '$lib/models/workspace-bootstrap';
import { readWorkspaceBootstrap } from '$lib/remote/workspace/bootstrap.remote';
import { syncPageSchema } from '$lib/models/sync';
import { workspaceResourceIdentitySchema } from '$lib/models/workspace-sync';

import {
	workspaceObjectReadSchema,
	workspaceRecordSchema,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import { pullWorkspaceChangePage, readWorkspaceResource } from '$lib/remote/workspace/sync.remote';
import {
	workspaceMutationResultSchema,
	workspaceWriteRecoverySchema
} from '$lib/models/workspace-mutations';
import {
	pushWorkspaceMutation,
	cancelWorkspaceMutation
} from '$lib/remote/workspace/mutations.remote';
import type { WorkspaceWriteController } from '$lib/controllers/workspace/transport';
import { OutboxAccountChangedError } from './outbox-contracts';
import { workspaceAccountHint } from './bootstrap-storage';
import type { SyncReadTransport } from './contracts';

const identityFromKey = (key: string) => {
	const [type, ...id] = z.array(z.string()).min(2).parse(JSON.parse(key));
	return workspaceResourceIdentitySchema.parse({ type, id });
};

/** Uncached RPCs leave availability, refresh, and request coalescing to the shared resource cache. */
export const workspaceReadAdapter = (accountId: string): SyncReadTransport<WorkspaceRecord> => ({
	async pull(since) {
		const request = pullWorkspaceChangePage({ accountId, since });
		const page = syncPageSchema(workspaceRecordSchema).parse(await request);
		return page;
	},
	async read(key, etag) {
		const request = readWorkspaceResource({ accountId, identity: identityFromKey(key), etag });
		const result = workspaceObjectReadSchema.parse(await request);
		return result;
	}
});

export const workspaceWriteAdapter = (accountId: string): WorkspaceWriteController => ({
	recovery: {
		observe: async (key) => {
			const response = await workspaceReadAdapter(accountId).read(key, null);
			if (response.kind === 'unchanged')
				throw new Error('Conflict review requires a complete server version');
			return response;
		},
		async cancel(input) {
			return workspaceWriteRecoverySchema.parse(
				await cancelWorkspaceMutation({
					operationId: input.operationId,
					request: JSON.stringify(input),
					accountId
				})
			);
		}
	},
	async send(input) {
		if (workspaceAccountHint(document.cookie) !== accountId)
			throw new OutboxAccountChangedError(
				'Sign in to the original account before sending its saved edits.'
			);
		const result = workspaceMutationResultSchema.parse(
			await pushWorkspaceMutation({ ...input, accountId })
		);
		return result;
	}
});

export const fetchWorkspaceBootstrap = async () => {
	const request = readWorkspaceBootstrap({});
	return workspaceBootstrapSchema.parse(await request);
};
