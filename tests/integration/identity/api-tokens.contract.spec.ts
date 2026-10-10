import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ApiTokens } from '$lib/server/controllers/api-tokens/controller';
import { AccessTokens } from '$lib/server/services/identity/api-tokens';
import { ApiTokenRecords } from '$lib/server/repositories/identity/postgres/api-tokens';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import * as schema from '$lib/server/db/schema/identity';
import { context } from '../database-harness';

const setup = async () => {
	const user = await new UserRecords(context.db).create({
		email: `tokens-${crypto.randomUUID()}@example.test`,
		displayName: 'Token contract',
		role: 'USER'
	});
	const tokens = new AccessTokens(new ApiTokenRecords(context.db));
	return { user, actor: { userId: user.id }, tokens, controller: new ApiTokens({ tokens }) };
};
it('stores only the credential hash and excludes it from public token records', async () => {
	const { actor, tokens, controller } = await setup();
	const minted = await tokens.mint(actor.userId, { name: 'Contract credential', scope: 'read' });
	const [stored] = await context.db
		.select()
		.from(schema.apiTokens)
		.where(eq(schema.apiTokens.id, minted.token.id));
	expect({
		storedHash: stored.tokenHash,
		hashIsCredential: stored.tokenHash === minted.plaintext,
		publicRecords: await controller.list(actor)
	}).toEqual({
		storedHash: Buffer.from(
			await crypto.subtle.digest('SHA-256', new TextEncoder().encode(minted.plaintext))
		).toString('hex'),
		hashIsCredential: false,
		publicRecords: [minted.token]
	});
});
it.each(['read', 'full'] as const)('authenticates with the persisted %s scope', async (scope) => {
	const { actor, user, tokens } = await setup();
	const minted = await tokens.mint(actor.userId, { name: 'Scope contract', scope });
	expect(await tokens.verify(`Bearer ${minted.plaintext}`)).toEqual({
		user,
		scope,
		tokenId: minted.token.id
	});
});
it('stops accepting a revoked credential and removes it from active listings', async () => {
	const { actor, tokens, controller } = await setup();
	const minted = await tokens.mint(actor.userId, { name: 'Revoke contract', scope: 'full' });
	await controller.revoke(actor, minted.token.id);
	expect({
		verified: await tokens.verify(`Bearer ${minted.plaintext}`),
		listed: await controller.list(actor)
	}).toEqual({ verified: null, listed: [] });
});
it('uses the current account role when validating an existing credential', async () => {
	const { actor, tokens } = await setup();
	const minted = await tokens.mint(actor.userId, { name: 'Role contract', scope: 'full' });
	await context.db
		.update(schema.users)
		.set({ role: 'WAITING' })
		.where(eq(schema.users.id, actor.userId));
	expect(await tokens.verify(`Bearer ${minted.plaintext}`)).toBeNull();
});
it('refuses an expired persisted credential', async () => {
	const { actor, tokens } = await setup();
	const minted = await tokens.mint(actor.userId, {
		name: 'Expiry contract',
		scope: 'read',
		expiresAt: new Date('2000-01-01T00:00:00Z')
	});
	expect(await tokens.verify(`Bearer ${minted.plaintext}`)).toBeNull();
});
it('keeps another actor’s credential private and valid after a refused revocation', async () => {
	const owner = await setup();
	const foreign = await setup();
	const minted = await owner.tokens.mint(owner.actor.userId, {
		name: 'Owned contract',
		scope: 'read'
	});
	const outcome = await foreign.controller.revoke(foreign.actor, minted.token.id).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({
		outcome,
		listed: await foreign.controller.list(foreign.actor),
		verified: (await owner.tokens.verify(`Bearer ${minted.plaintext}`))?.user.id
	}).toEqual({ outcome: 'Access token not found', listed: [], verified: owner.user.id });
});
