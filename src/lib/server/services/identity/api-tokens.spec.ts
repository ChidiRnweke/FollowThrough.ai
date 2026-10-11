import { describe, expect, it } from 'vitest';
import {
	InMemoryApiTokenRepository,
	testTokenUser
} from '$lib/testing/identity/fakes/in-memory-api-tokens';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { AccessTokens, TokenVerification } from './api-tokens';

const userId = testActor().userId;

const service = (
	overrides: Parameters<typeof testTokenUser>[1] = {}
): {
	service: AccessTokens;
	verification: TokenVerification;
	repository: InMemoryApiTokenRepository;
} => {
	const repository = new InMemoryApiTokenRepository(testActor(), [
		testTokenUser(userId, overrides)
	]);
	return {
		service: new AccessTokens(repository),
		verification: new TokenVerification(repository),
		repository
	};
};

const mint = async (scope: 'read' | 'full' = 'read') => {
	const { service: subject, verification, repository } = service();
	const minted = await subject.mint({ name: 'Claude Desktop', scope });
	return { subject, verification, repository, minted };
};

describe('API token minting', () => {
	it('returns a prefixed credential without storing its plaintext', async () => {
		const { minted } = await mint();
		expect({
			prefix: minted.plaintext.startsWith('ftm_'),
			storedPlaintext: JSON.stringify(minted.token).includes(minted.plaintext)
		}).toEqual({ prefix: true, storedPlaintext: false });
	});

	it('issues a distinct credential each time', async () => {
		const { subject } = await mint();
		const [first, second] = await Promise.all([
			subject.mint({ name: 'a', scope: 'read' }),
			subject.mint({ name: 'b', scope: 'read' })
		]);
		expect(first.plaintext).not.toEqual(second.plaintext);
	});
});

describe('API token verification', () => {
	it('accepts the minted full-scope credential as a bearer header', async () => {
		const { verification, minted } = await mint('full');
		const verified = await verification.verify(`Bearer ${minted.plaintext}`);
		expect({ userId: verified?.user.id, scope: verified?.scope }).toEqual({
			userId,
			scope: 'full'
		});
	});

	it('rejects a credential that was never minted', async () => {
		const { verification } = await mint();
		expect(await verification.verify('Bearer ftm_deadbeef')).toBeNull();
	});

	it('rejects a header without the Bearer scheme', async () => {
		const { verification, minted } = await mint();
		expect(await verification.verify(minted.plaintext)).toBeNull();
	});

	it('rejects a missing header', async () => {
		const { verification } = await mint();
		expect(await verification.verify(null)).toBeNull();
	});

	it('rejects a revoked token', async () => {
		const { subject, verification, minted } = await mint();
		await subject.revoke(minted.token.id);
		expect({
			verified: await verification.verify(`Bearer ${minted.plaintext}`),
			listed: await subject.list()
		}).toEqual({ verified: null, listed: [] });
	});

	it('rejects an expired token', async () => {
		const { verification, repository, minted } = await mint();
		repository.expire(minted.token.id, new Date(Date.now() - 1000));
		expect(await verification.verify(`Bearer ${minted.plaintext}`)).toBeNull();
	});

	it('rejects a token whose owner is still awaiting approval', async () => {
		const { service: subject, verification } = service({ role: 'WAITING' });
		const minted = await subject.mint({ name: 'early', scope: 'read' });
		expect(await verification.verify(`Bearer ${minted.plaintext}`)).toBeNull();
	});
});

describe('API token listing', () => {
	it('does not revoke a token belonging to another user', async () => {
		const { repository, minted } = await mint();
		const otherUser = new AccessTokens(repository.boundTo(testActor(2)));
		await expect(otherUser.revoke(minted.token.id)).rejects.toThrow('Access token not found');
	});
});
