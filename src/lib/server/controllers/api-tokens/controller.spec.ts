import { describe, expect, it } from 'vitest';
import type { ActorContext, ApiToken, ApiTokenId, ApiTokenScope, UserId } from '$lib/models';
import type {
	IAccessTokens,
	MintedApiToken,
	VerifiedApiToken
} from '$lib/server/services/identity/api-tokens';
import { testActor, testNow } from '$lib/testing/fixtures/domain-builders';
import { ApiTokens } from './controller';

const tokenId = '00000000-0000-4000-8000-000000000071' as ApiTokenId;
const token = (): ApiToken => ({
	id: tokenId,
	userId: testActor().userId,
	name: 'Local integration',
	scope: 'read',
	createdAt: testNow
});

class FakeAccessTokens implements IAccessTokens {
	tokens: ApiToken[] = [token()];

	async mint(
		_userId: UserId,
		_input: { name: string; scope: ApiTokenScope; expiresAt?: Date }
	): Promise<MintedApiToken> {
		void _userId;
		void _input;
		throw new Error('Minting is outside this controller');
	}

	async verify(_authorizationHeader: string | null): Promise<VerifiedApiToken | null> {
		void _authorizationHeader;
		throw new Error('Verification is outside this controller');
	}

	async list(actor: ActorContext): Promise<readonly ApiToken[]> {
		return this.tokens.filter((candidate) => candidate.userId === actor.userId);
	}

	async revoke(actor: ActorContext, id: ApiTokenId): Promise<void> {
		this.tokens = this.tokens.filter(
			(candidate) => candidate.id !== id || candidate.userId !== actor.userId
		);
	}
}

describe('API token controller behavior', () => {
	it('lists credentials owned by the actor', async () => {
		const tokens = new FakeAccessTokens();
		const controller = new ApiTokens({ tokens });
		expect(await controller.list(testActor())).toEqual([token()]);
	});

	it('revokes an owned credential', async () => {
		const tokens = new FakeAccessTokens();
		const controller = new ApiTokens({ tokens });
		await controller.revoke(testActor(), tokenId);
		expect(tokens.tokens).toEqual([]);
	});

	it('does not revoke another actor’s credential', async () => {
		const tokens = new FakeAccessTokens();
		const controller = new ApiTokens({ tokens });
		await controller.revoke(testActor(2), tokenId);
		expect(tokens.tokens).toEqual([token()]);
	});
});
