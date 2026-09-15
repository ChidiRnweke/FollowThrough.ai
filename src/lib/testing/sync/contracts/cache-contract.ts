import { expect, it } from 'vitest';
import type { SyncCacheRepository } from '$lib/client/sync/contracts';
import { syncCursorSchema, syncEtag, type ResourceState } from '$lib/models/sync';

const body = (version: bigint, value: string): ResourceState<string> => ({
	kind: 'present',
	snapshot: { etag: syncEtag(version), value }
});

/** The same durable contract is required of test and browser repositories. */
export const cacheRepositoryContract = (create: () => SyncCacheRepository<string>): void => {
	it('does not replace a newer body with a stale writer result', async () => {
		const repository = create();
		await repository.commit('alice', {
			put: [{ key: 'note', entry: body(2n, 'Latest') }],
			remove: []
		});
		await repository.commit('alice', {
			put: [{ key: 'note', entry: body(1n, 'Earlier') }],
			remove: []
		});
		expect((await repository.load('alice')).records).toEqual([
			{ key: 'note', entry: body(2n, 'Latest') }
		]);
	});
	it('rejects an ambiguous change before any body becomes durable', async () => {
		const repository = create();
		const entry = { key: 'note', entry: body(1n, 'Earlier') };
		await expect(repository.commit('alice', { put: [entry, entry], remove: [] })).rejects.toThrow(
			'each resource only once'
		);
	});
	it('does not regress the journal position when a stale writer finishes', async () => {
		const repository = create();
		await repository.commit('alice', { put: [], remove: [], cursor: syncCursorSchema.parse('9') });
		await repository.commit('alice', { put: [], remove: [], cursor: syncCursorSchema.parse('3') });
		expect((await repository.load('alice')).cursor).toBe('9');
	});
};
