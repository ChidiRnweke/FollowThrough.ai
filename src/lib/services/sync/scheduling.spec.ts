import { describe, expect, it } from 'vitest';
import type { SyncLaneState } from '$lib/models/sync';
import { SyncSchedulingService } from './scheduling';

const idleLane: SyncLaneState = {
	requested: false,
	running: null,
	retry: null,
	failures: 0,
	result: { kind: 'idle' }
};

describe('account synchronization retry policy', () => {
	it('starts retries after one second', () => {
		expect(new SyncSchedulingService().retryAt(1, 500)).toBe(1500);
	});
	it('preserves the sixty-second maximum backoff', () => {
		expect(new SyncSchedulingService().retryAt(20, 500)).toBe(60500);
	});
	it('allows a write exactly at its retry deadline while excluding later writes', () => {
		expect([
			...new SyncSchedulingService().excludedWrites(
				new Map([
					['ready', { attempts: 1, at: 1000 }],
					['later', { attempts: 1, at: 1001 }]
				]),
				1000
			)
		]).toEqual(['later']);
	});
	it('backs off the submission lane even when its operation deadline has passed', () => {
		expect(
			new SyncSchedulingService().wakeAt(
				{
					pull: idleLane,
					writes: {
						...idleLane,
						retry: 5000,
						failures: 2,
						result: { kind: 'failure', message: 'Storage unavailable' }
					}
				},
				new Map([['pending', { attempts: 1, at: 1000 }]])
			)
		).toBe(5000);
	});
});
