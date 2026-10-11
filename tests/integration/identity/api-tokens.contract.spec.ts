import { ApiTokens } from '$lib/server/controllers/api-tokens/controller';
import * as schema from '$lib/server/db/schema/identity';
import {
	ApiTokenCredentialRecords,
	ApiTokenRecords
} from '$lib/server/repositories/identity/postgres/api-tokens';
import { UserAccountRecords } from '$lib/server/repositories/identity/postgres/users';
import { AccessTokens, TokenVerification } from '$lib/server/services/identity/api-tokens';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { context } from '../database-harness';

const setup = async () => {
	const user = await new UserAccountRecords(context.db).create({
		email: `tokens-${crypto.randomUUID()}@example.test`,
		displayName: 'Token contract',
		role: 'USER'
	});
	const actor = { userId: user.id };
	const tokens = new AccessTokens(new ApiTokenRecords(actor, context.db));
	return {
		user,
		actor,
		tokens,
		verification: new TokenVerification(new ApiTokenCredentialRecords(context.db)),
		controller: new ApiTokens({
			...agentToolResultsFixture(),
			tokens
		})
	};
};
it('stores only the credential hash and excludes it from public token records', async () => {
	const { tokens, controller } = await setup();
	const minted = await tokens.mint({ name: 'Contract credential', scope: 'read' });
	const [stored] = await context.db
		.select()
		.from(schema.apiTokens)
		.where(eq(schema.apiTokens.id, minted.token.id));
	expect({
		storedHash: stored.tokenHash,
		hashIsCredential: stored.tokenHash === minted.plaintext,
		publicRecords: await controller.list()
	}).toEqual({
		storedHash: Buffer.from(
			await crypto.subtle.digest('SHA-256', new TextEncoder().encode(minted.plaintext))
		).toString('hex'),
		hashIsCredential: false,
		publicRecords: [minted.token]
	});
});
it.each(['read', 'full'] as const)('authenticates with the persisted %s scope', async (scope) => {
	const { user, tokens, verification } = await setup();
	const minted = await tokens.mint({ name: 'Scope contract', scope });
	expect(await verification.verify(`Bearer ${minted.plaintext}`)).toEqual({
		user,
		scope,
		tokenId: minted.token.id
	});
});
it('stops accepting a revoked credential and removes it from active listings', async () => {
	const { tokens, controller, verification } = await setup();
	const minted = await tokens.mint({ name: 'Revoke contract', scope: 'full' });
	await controller.revoke(minted.token.id);
	expect({
		verified: await verification.verify(`Bearer ${minted.plaintext}`),
		listed: await controller.list()
	}).toEqual({ verified: null, listed: [] });
});
it('uses the current account role when validating an existing credential', async () => {
	const { actor, tokens, verification } = await setup();
	const minted = await tokens.mint({ name: 'Role contract', scope: 'full' });
	await context.db
		.update(schema.users)
		.set({ role: 'WAITING' })
		.where(eq(schema.users.id, actor.userId));
	expect(await verification.verify(`Bearer ${minted.plaintext}`)).toBeNull();
});
it('refuses an expired persisted credential', async () => {
	const { tokens, verification } = await setup();
	const minted = await tokens.mint({
		name: 'Expiry contract',
		scope: 'read',
		expiresAt: new Date('2000-01-01T00:00:00Z')
	});
	expect(await verification.verify(`Bearer ${minted.plaintext}`)).toBeNull();
});
it('keeps another actor’s credential private and valid after a refused revocation', async () => {
	const owner = await setup();
	const foreign = await setup();
	const minted = await owner.tokens.mint({
		name: 'Owned contract',
		scope: 'read'
	});
	const outcome = await foreign.controller.revoke(minted.token.id).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({
		outcome,
		listed: await foreign.controller.list(),
		verified: (await owner.verification.verify(`Bearer ${minted.plaintext}`))?.user.id
	}).toEqual({ outcome: 'Access token not found', listed: [], verified: owner.user.id });
});
