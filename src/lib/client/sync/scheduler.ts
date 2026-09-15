/** Time and wake-ups belong to the client boundary, not to queue state transitions. */
export interface SyncScheduler {
	now(): number;
	schedule(at: number, work: () => Promise<void>): () => void;
}

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
