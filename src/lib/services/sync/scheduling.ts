import type { SyncLane, SyncLaneState, SyncWriteRetry } from '$lib/models/sync';

export interface ISyncSchedulingService {
	retryAt(attempts: number, now: number): number;
	excludedWrites(retries: ReadonlyMap<string, SyncWriteRetry>, now: number): ReadonlySet<string>;
	wakeAt(
		lanes: Readonly<Record<SyncLane, SyncLaneState>>,
		retries: ReadonlyMap<string, SyncWriteRetry>
	): number | null;
	dueLanes(
		lanes: Readonly<Record<SyncLane, SyncLaneState>>,
		retries: ReadonlyMap<string, SyncWriteRetry>,
		now: number
	): readonly SyncLane[];
}

/** Retry eligibility preserves independent operations and the existing bounded backoff. */
export class SyncSchedulingService implements ISyncSchedulingService {
	retryAt(attempts: number, now: number): number {
		return now + Math.min(60_000, 1000 * 2 ** Math.min(attempts - 1, 6));
	}
	excludedWrites(retries: ReadonlyMap<string, SyncWriteRetry>, now: number): ReadonlySet<string> {
		return new Set([...retries].filter(([, retry]) => retry.at > now).map(([id]) => id));
	}
	wakeAt(
		lanes: Readonly<Record<SyncLane, SyncLaneState>>,
		retries: ReadonlyMap<string, SyncWriteRetry>
	): number | null {
		const deadlines = Object.values(lanes).flatMap((lane) =>
			!lane.running && lane.retry !== null ? [lane.retry] : []
		);
		if (!lanes.writes.running && lanes.writes.retry === null)
			deadlines.push(...[...retries.values()].map((retry) => retry.at));
		return deadlines.length ? Math.min(...deadlines) : null;
	}
	dueLanes(
		lanes: Readonly<Record<SyncLane, SyncLaneState>>,
		retries: ReadonlyMap<string, SyncWriteRetry>,
		now: number
	): readonly SyncLane[] {
		return (['pull', 'writes'] as const).filter(
			(lane) =>
				(lanes[lane].retry !== null && lanes[lane].retry <= now) ||
				(lane === 'writes' && [...retries.values()].some((retry) => retry.at <= now))
		);
	}
}
