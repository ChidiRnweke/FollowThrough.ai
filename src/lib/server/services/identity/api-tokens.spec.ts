import { describe, expect, it } from 'vitest';
import {
	InMemoryApiTokenRepository,
	testTokenUser
} from '$lib/testing/identity/fakes/in-memory-api-tokens';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { AccessTokens } from './api-tokens';

const userId = testActor().userId;

const service = (
	overrides: Parameters<typeof testTokenUser>[1] = {}
): { service: AccessTokens; repository: InMemoryApiTokenRepository } => {
	const repository = new InMemoryApiTokenRepository([testTokenUser(userId, overrides)]);
	return { service: new AccessTokens(repository), repository };
};

const mint = async (scope: 'read' | 'full' = 'read') => {
	const { service: subject, repository } = service();
	const minted = await subject.mint(userId, { name: 'Claude Desktop', scope });
	return { subject, repository, minted };
};

describe('API token minting', () => {
	it('returns a prefixed plaintext credential', async () => {
		const { minted } = await mint();
		expect(minted.plaintext.startsWith('ftm_')).toBe(true);
	});

	it('never exposes the plaintext on the stored record', async () => {
		const { minted } = await mint();
		expect(JSON.stringify(minted.token)).not.toContain(minted.plaintext);
	});

	it('issues a distinct credential each time', async () => {
		const { subject } = await mint();
		const [first, second] = await Promise.all([
			subject.mint(userId, { name: 'a', scope: 'read' }),
			subject.mint(userId, { name: 'b', scope: 'read' })
		]);
		expect(first.plaintext).not.toEqual(second.plaintext);
	});
});

describe('API token verification', () => {
	it('accepts the minted credential as a bearer header', async () => {
		const { subject, minted } = await mint();
		const verified = await subject.verify(`Bearer ${minted.plaintext}`);
		expect(verified?.user.id).toEqual(userId);
	});

	it('carries the scope the token was minted with', async () => {
		const { subject, minted } = await mint('full');
		const verified = await subject.verify(`Bearer ${minted.plaintext}`);
		expect(verified?.scope).toEqual('full');
	});

	it('rejects a credential that was never minted', async () => {
		const { subject } = await mint();
		expect(await subject.verify('Bearer ftm_deadbeef')).toBeNull();
	});

	it('rejects a header without the Bearer scheme', async () => {
		const { subject, minted } = await mint();
		expect(await subject.verify(minted.plaintext)).toBeNull();
	});

	it('rejects a missing header', async () => {
		const { subject } = await mint();
		expect(await subject.verify(null)).toBeNull();
	});

	it('rejects a revoked token', async () => {
		const { subject, minted } = await mint();
		await subject.revoke(testActor(), minted.token.id);
		expect(await subject.verify(`Bearer ${minted.plaintext}`)).toBeNull();
	});

	it('rejects an expired token', async () => {
		const { subject, repository, minted } = await mint();
		repository.expire(minted.token.id, new Date(Date.now() - 1000));
		expect(await subject.verify(`Bearer ${minted.plaintext}`)).toBeNull();
	});

	it('rejects a token whose owner is still awaiting approval', async () => {
		const { service: subject } = service({ role: 'WAITING' });
		const minted = await subject.mint(userId, { name: 'early', scope: 'read' });
		expect(await subject.verify(`Bearer ${minted.plaintext}`)).toBeNull();
	});
});

describe('API token listing', () => {
	it('omits revoked tokens', async () => {
		const { subject, minted } = await mint();
		await subject.revoke(testActor(), minted.token.id);
		expect(await subject.list(testActor())).toEqual([]);
	});

	it('does not revoke a token belonging to another user', async () => {
		const { subject, minted } = await mint();
		await subject.revoke(testActor(2), minted.token.id);
		expect(await subject.list(testActor())).toHaveLength(1);
	});
});
