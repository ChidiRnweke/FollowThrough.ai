import type { AccountWriterLock } from './mutation-queue';

/** The browser releases the lock when a tab exits, before another tab recovers its writes. */
export const browserWriterLock: AccountWriterLock = {
	run: (accountId, work) => navigator.locks.request(`workspace-sync:write:${accountId}`, work)
};
