import { z } from 'zod';
import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { syncCursorSchema, syncEtagSchema } from '$lib/models/sync';
import { syncBodyBatchSize } from '$lib/models/sync';
import { workspaceResourceIdentitySchema } from '$lib/models/workspace-sync';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const pullWorkspaceChangePage = command(
	z.object({ accountId: z.string().uuid(), since: syncCursorSchema }),
	async ({ accountId, since }) => {
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		return AppFactory.controllers().workspace().pullChangePage(actor, since);
	}
);
export const readWorkspaceResources = command(
	z.object({
		accountId: z.string().uuid(),
		requests: z
			.array(
				z.object({ identity: workspaceResourceIdentitySchema, etag: syncEtagSchema.nullable() })
			)
			.min(1)
			.max(syncBodyBatchSize)
	}),
	async ({ accountId, requests }) => {
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		return AppFactory.controllers().workspace().readResources(actor, requests);
	}
);

export const pullWorkspaceChanges = command(
	z.object({
		accountId: z.string().uuid(),
		since: syncCursorSchema
	}),
	async ({ accountId, since }) => {
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		return AppFactory.controllers().workspace().pullChanges(actor, since);
	}
);

export const readWorkspaceResource = command(
	z.object({
		accountId: z.string().uuid(),
		identity: workspaceResourceIdentitySchema,
		etag: syncEtagSchema.nullable()
	}),
	async ({ accountId, identity, etag }) => {
		const actor = requestActor();
		if (actor.userId !== accountId) error(403, 'The synchronization account changed');
		return AppFactory.controllers().workspace().readResource(actor, identity, etag);
	}
);
