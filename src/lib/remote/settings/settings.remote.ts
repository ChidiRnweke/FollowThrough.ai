import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { ApiTokenId } from '$lib/models/identity';

export const listApiTokens = query(async () =>
	AppFactory.controllers().apiTokens().list(requestActor())
);

/**
 * Returns the plaintext credential — the only time it exists outside the
 * client's config. The caller must show it immediately; it is not recoverable.
 */
export const createApiToken = command(
	z.object({ name: z.string().min(1).max(80), scope: z.enum(['read', 'full']) }),
	async (input) => {
		const minted = await AppFactory.accessTokens().mint(requestActor().userId, input);
		await listApiTokens().refresh();
		return { token: minted.token, plaintext: minted.plaintext };
	}
);

export const revokeApiToken = command(z.string().uuid(), async (id) => {
	await AppFactory.controllers()
		.apiTokens()
		.revoke(requestActor(), id as ApiTokenId);
	await listApiTokens().refresh();
});
