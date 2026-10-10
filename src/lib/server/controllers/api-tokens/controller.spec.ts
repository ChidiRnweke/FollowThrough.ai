import { AccessTokens } from '$lib/server/services/identity/api-tokens';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryApiTokenRepository,
	testTokenUser
} from '$lib/testing/identity/fakes/in-memory-api-tokens';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { ApiTokens } from './controller';

const setup = async () => {
	const actor = testActor();
	const tokens = new AccessTokens(
		new InMemoryApiTokenRepository([
			testTokenUser(actor.userId),
			testTokenUser(testActor(2).userId)
		])
	);
	const minted = await tokens.mint(actor.userId, { name: 'Local integration', scope: 'read' });
	return {
		tokens,
		minted,
		controller: new ApiTokens({
			...agentToolResultsFixture(),
			tokens
		})
	};
};
describe('API token controller behavior', () => {
	it('lists only credentials owned by the actor without exposing plaintext', async () => {
		const { tokens, minted, controller } = await setup();
		await tokens.mint(testActor(2).userId, { name: 'Other account', scope: 'full' });
		expect(await controller.list(testActor())).toEqual([minted.token]);
	});
	it('revokes the credential used for subsequent authentication', async () => {
		const { tokens, minted, controller } = await setup();
		const result = await controller.revoke(testActor(), minted.token.id);
		expect({
			result,
			verified: await tokens.verify(`Bearer ${minted.plaintext}`),
			listed: await controller.list(testActor())
		}).toEqual({
			result: { id: minted.token.id, name: minted.token.name },
			verified: null,
			listed: []
		});
	});
	it('does not revoke another actor’s credential', async () => {
		const { tokens, minted, controller } = await setup();
		const outcome = await controller.revoke(testActor(2), minted.token.id).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({
			outcome,
			verified: (await tokens.verify(`Bearer ${minted.plaintext}`))?.user.id
		}).toEqual({ outcome: 'Access token not found', verified: testActor().userId });
	});
});
