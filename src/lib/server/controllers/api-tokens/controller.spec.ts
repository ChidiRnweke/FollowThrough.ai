import { AccessTokens, TokenVerification } from '$lib/server/services/identity/api-tokens';
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
	const repository = new InMemoryApiTokenRepository(actor, [
		testTokenUser(actor.userId),
		testTokenUser(testActor(2).userId)
	]);
	const tokens = new AccessTokens(repository);
	const minted = await tokens.mint({ name: 'Local integration', scope: 'read' });
	const controllerFor = (tokens: AccessTokens) =>
		new ApiTokens({ ...agentToolResultsFixture(), tokens });
	return {
		minted,
		verification: new TokenVerification(repository),
		otherUser: new AccessTokens(repository.boundTo(testActor(2))),
		controller: controllerFor(tokens),
		otherController: controllerFor(new AccessTokens(repository.boundTo(testActor(2))))
	};
};
describe('API token controller behavior', () => {
	it('lists only credentials owned by the actor without exposing plaintext', async () => {
		const { otherUser, minted, controller } = await setup();
		await otherUser.mint({ name: 'Other account', scope: 'full' });
		expect(await controller.list()).toEqual([minted.token]);
	});
	it('revokes the credential used for subsequent authentication', async () => {
		const { verification, minted, controller } = await setup();
		const result = await controller.revoke(minted.token.id);
		expect({
			result,
			verified: await verification.verify(`Bearer ${minted.plaintext}`),
			listed: await controller.list()
		}).toEqual({
			result: { id: minted.token.id, name: minted.token.name },
			verified: null,
			listed: []
		});
	});
	it('does not revoke another actor’s credential', async () => {
		const { verification, minted, otherController } = await setup();
		const outcome = await otherController.revoke(minted.token.id).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({
			outcome,
			verified: (await verification.verify(`Bearer ${minted.plaintext}`))?.user.id
		}).toEqual({ outcome: 'Access token not found', verified: testActor().userId });
	});
});
