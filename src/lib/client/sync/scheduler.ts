import type { SyncScheduler } from '$lib/models/sync';
export type { SyncScheduler } from '$lib/models/sync';

export const browserSyncScheduler: SyncScheduler = {
	now: () => Date.now(),
	schedule(at, work) {
		const timer = setTimeout(
			() => {
				void work();
			},
			Math.max(0, at - Date.now())
		);
		return () => clearTimeout(timer);
	}
};
