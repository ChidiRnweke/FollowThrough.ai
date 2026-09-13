import { z } from 'zod';
import { workspaceBootstrapSchema } from '$lib/models/workspace-bootstrap';
import { readWorkspaceBootstrap } from '$lib/remote/workspace/bootstrap.remote';
import { syncChangePageSchema } from '$lib/models/sync';
import { workspaceResourceIdentitySchema, workspaceResourceKey } from '$lib/models/workspace-sync';
import {
	workspaceObjectReadSchema,
	workspaceRecordIdentity,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	pullWorkspaceChangePage,
	readWorkspaceResource,
	readWorkspaceResources
} from '$lib/remote/workspace/sync.remote';
import {
	workspaceMutationResultSchema,
	workspaceWriteRecoverySchema,
	mutationResource,
	type WorkspaceCommand
} from '$lib/models/workspace-mutations';
import {
	pushWorkspaceMutation,
	cancelWorkspaceMutation,
	acknowledgeWorkspaceMutation
} from '$lib/remote/workspace/mutations.remote';
import type { OutboxTransport } from './outbox-contracts';
import { OutboxAccountChangedError } from './outbox-contracts';
import { workspaceAccountHint } from './bootstrap-storage';
import type { SyncReadTransport } from './contracts';

const identityFromKey = (key: string) => {
	const [type, ...id] = z.array(z.string()).min(2).parse(JSON.parse(key));
	return workspaceResourceIdentitySchema.parse({ type, id });
};

/** Uncached RPCs leave availability, refresh, and request coalescing to the shared resource cache. */
export const workspaceReadTransport = (accountId: string): SyncReadTransport<WorkspaceRecord> => ({
	async pull(since) {
		const request = pullWorkspaceChangePage({ accountId, since });
		return syncChangePageSchema.parse(await request);
	},
	async readMany(requests) {
		const response = await readWorkspaceResources({
			accountId,
			requests: requests.map(({ key, etag }) => ({ identity: identityFromKey(key), etag }))
		});
		const resultSchema = z.union([
			workspaceObjectReadSchema,
			z.object({ kind: z.literal('failure'), message: z.string() })
		]);
		const results = z
			.array(z.object({ key: z.string(), result: z.json() }))
			.parse(response)
			.map(({ key, result }) => {
				const parsed = resultSchema.safeParse(result);
				return {
					key,
					result: parsed.success
						? parsed.data
						: {
								kind: 'failure' as const,
								message: 'This saved copy has an incompatible format. Retry after updating the app.'
							}
				};
			});
		if (
			results.length !== requests.length ||
			new Set(results.map((item) => item.key)).size !== results.length ||
			results.some((item) => !requests.some((request) => request.key === item.key))
		)
			throw new Error('The server returned a different resource batch');
		return results.map(({ key, result }) => ({
			key,
			result:
				result.kind === 'found' &&
				workspaceResourceKey(workspaceRecordIdentity(result.snapshot.value)) !== key
					? { kind: 'failure' as const, message: 'The server returned a different resource' }
					: result
		}));
	},
	async read(key, etag) {
		const request = readWorkspaceResource({ accountId, identity: identityFromKey(key), etag });
		const result = workspaceObjectReadSchema.parse(await request);
		if (
			result.kind === 'found' &&
			workspaceResourceKey(workspaceRecordIdentity(result.snapshot.value)) !== key
		)
			throw new Error('The server returned a different resource');
		return result;
	}
});

export const workspaceWriteTransport = (
	accountId: string
): OutboxTransport<WorkspaceCommand, WorkspaceRecord> => ({
	recovery: {
		observe: async (key) => {
			const response = await workspaceReadTransport(accountId).read(key, null);
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
		},
		async acknowledge(operationId) {
			z.object({ kind: z.literal('acknowledged') }).parse(
				await acknowledgeWorkspaceMutation({ accountId, operationId, protocol: 2 })
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
		if (result.kind === 'applied' && result.receipt.operationId !== input.operationId)
			throw new Error('The server acknowledged a different operation');
		if (result.kind === 'compacted' && result.proof.operationId !== input.operationId)
			throw new Error('The server acknowledged a different operation');
		const resource =
			result.kind === 'applied'
				? result.receipt.resource
				: result.kind === 'conflict'
					? result.remote
					: null;
		if (
			resource?.kind === 'found' &&
			workspaceResourceKey(workspaceRecordIdentity(resource.snapshot.value)) !==
				workspaceResourceKey(mutationResource(input.command))
		)
			throw new Error('The server returned a different resource');
		return result;
	}
});

export const fetchWorkspaceBootstrap = async () => {
	const request = readWorkspaceBootstrap({});
	return workspaceBootstrapSchema.parse(await request);
};
