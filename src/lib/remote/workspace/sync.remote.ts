import { z } from 'zod';
import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { syncCursorSchema, syncEtagSchema } from '$lib/models/sync';
import { workspaceResourceIdentitySchema } from '$lib/models/workspace-sync';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const pullWorkspaceChanges = query(
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

export const readWorkspaceResource = query(
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
