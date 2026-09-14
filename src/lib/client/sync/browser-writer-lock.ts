import type { AccountWriterLock } from './mutation-queue';

/** The browser releases the lock when a tab exits, before another tab recovers its writes. */
export const browserWriterLock: AccountWriterLock = {
	tryRun: (accountId, work) =>
		navigator.locks.request(
			`workspace-sync:write:${accountId}`,
			{ ifAvailable: true },
			async (lock) => (lock ? { kind: 'acquired', value: await work() } : { kind: 'busy' })
		),
	run: (accountId, work) => navigator.locks.request(`workspace-sync:write:${accountId}`, work)
};
