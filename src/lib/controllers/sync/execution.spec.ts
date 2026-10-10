import { describe, expect, it } from 'vitest';
import { createWorkspaceSynchronization } from '$lib/factories/sync/execution';
import type { WorkspaceSynchronizationDependencies } from './execution';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';

const setup = (operations: Pick<WorkspaceSynchronizationDependencies, 'pull' | 'writes'>) => {
	const scheduler = new InMemorySyncScheduler();
	const runtime = createWorkspaceSynchronization({
		scheduler,
		failed: () => undefined,
		...operations
	});
	return { runtime, scheduler };
};

describe('account synchronization lanes', () => {
	it('discovers secondary records when a write commits after the first pull', async () => {
		let server = 'before';
		let downloaded = '';
		const firstPull = Promise.withResolvers<void>();
		const visible = Promise.withResolvers<void>();
		const { runtime } = setup({
			pull: async () => {
				downloaded = server;
				firstPull.resolve();
				if (server === 'after') visible.resolve();
				return { kind: 'complete' };
			},
			writes: async () => {
				await firstPull.promise;
				server = 'after';
				runtime.committed();
				return { kind: 'complete' };
			}
		});
		await runtime.synchronize();
		await visible.promise;
		runtime.stop();
		expect(downloaded).toBe('after');
	});
	it('retries a first lane failure without waiting for focus or another edit', async () => {
		let unavailable = true;
		let downloaded = '';
		const { runtime, scheduler } = setup({
			pull: async () => {
				if (unavailable) throw new Error('Storage unavailable');
				downloaded = 'recovered';
				return { kind: 'complete' };
			},
			writes: async () => ({ kind: 'complete' })
		});
		await runtime.synchronize();
		unavailable = false;
		await scheduler.advance(1000);
		runtime.stop();
		expect(downloaded).toBe('recovered');
	});
	it('keeps downloads responsive while submission waits for a response', async () => {
		let downloaded = false;
		const gate = Promise.withResolvers<void>();
		const visible = Promise.withResolvers<void>();
		const { runtime } = setup({
			pull: async () => {
				downloaded = true;
				visible.resolve();
				return { kind: 'complete' };
			},
			writes: async () => {
				await gate.promise;
				return { kind: 'complete' };
			}
		});
		const syncing = runtime.synchronize();
		await visible.promise;
		const duringSubmission = downloaded;
		gate.resolve();
		await syncing;
		runtime.stop();
		expect(duringSubmission).toBe(true);
	});
	it('does not restart failed lanes while offline', async () => {
		let unavailable = true;
		let downloaded = false;
		const { runtime, scheduler } = setup({
			pull: async () => {
				if (unavailable) throw new Error('Disconnected');
				downloaded = true;
				return { kind: 'complete' };
			},
			writes: async () => ({ kind: 'complete' })
		});
		await runtime.synchronize();
		runtime.setOnline(false);
		unavailable = false;
		await scheduler.advance(5000);
		runtime.stop();
		expect(downloaded).toBe(false);
	});
});

it('submits independent new work before another operation retry deadline', async () => {
	let independentQueued = false;
	let independentApplied = false;
	const applied = Promise.withResolvers<void>();
	const { runtime } = setup({
		pull: async () => ({ kind: 'complete' }),
		writes: async () => {
			if (independentQueued) {
				independentApplied = true;
				applied.resolve();
			}
			runtime.deferWrite('another-operation');
			return { kind: 'failure', message: 'Another operation awaits retry' };
		}
	});
	await runtime.synchronize();
	independentQueued = true;
	runtime.changed();
	await applied.promise;
	runtime.stop();
	expect(independentApplied).toBe(true);
});

it('clears the retry deadline after startup storage recovers', async () => {
	const scheduler = new InMemorySyncScheduler();
	let unavailable = true;
	let state: string;
	const runtime = createWorkspaceSynchronization({
		scheduler,
		pull: async () => ({ kind: 'complete' }),
		writes: async () => {
			if (unavailable) throw new Error('Unavailable');
			state = 'recovered';
			return { kind: 'complete' };
		},
		failed: () => undefined
	});
	await runtime.synchronize();
	unavailable = false;
	await scheduler.advance(1000);
	state = 'idle';
	await scheduler.advance(60_000);
	runtime.stop();
	expect(state).toBe('idle');
});

it('clears an error after its automatic retry succeeds', async () => {
	const scheduler = new InMemorySyncScheduler();
	let unavailable = true;
	const reported: (string | null)[] = [];
	const runtime = createWorkspaceSynchronization({
		scheduler,
		pull: async () => {
			if (unavailable) throw new Error('Unavailable');
			return { kind: 'complete' };
		},
		writes: async () => ({ kind: 'complete' }),
		failed: (message) => {
			reported.push(message);
		}
	});
	await runtime.synchronize();
	unavailable = false;
	await scheduler.advance(1000);
	runtime.stop();
	expect(reported.at(-1)).toBeNull();
});

it('backs off storage failures when an operation deadline has already expired', async () => {
	let storageUnavailable = false;
	let delivered = false;
	const { runtime, scheduler } = setup({
		pull: async () => ({ kind: 'complete' }),
		writes: async () => {
			if (storageUnavailable) throw new Error('Storage unavailable');
			if (scheduler.now() === 0) {
				runtime.deferWrite('pending');
				return { kind: 'failure', message: 'Connection lost' };
			}
			delivered = true;
			runtime.clearWriteRetry('pending');
			return { kind: 'complete' };
		}
	});
	await runtime.synchronize();
	storageUnavailable = true;
	await scheduler.advance(5000);
	storageUnavailable = false;
	await scheduler.advance(10_000);
	runtime.stop();
	expect(delivered).toBe(true);
});

it('does not publish delayed lane results after the account stops', async () => {
	const scheduler = new InMemorySyncScheduler();
	const gate = Promise.withResolvers<void>();
	const reported: (string | null)[] = [];
	const runtime = createWorkspaceSynchronization({
		scheduler,
		pull: async () => {
			await gate.promise;
			return { kind: 'complete' };
		},
		writes: async () => {
			await gate.promise;
			return { kind: 'complete' };
		},
		failed: (message) => {
			reported.push(message);
		}
	});
	const synchronization = runtime.synchronize();
	runtime.stop();
	gate.resolve();
	await synchronization;
	await scheduler.advance(60000);
	expect({ status: runtime.writeStatus, reported }).toEqual({
		status: { kind: 'stopped' },
		reported: []
	});
});

it('releases retry records and ignores delayed write failure after account teardown', async () => {
	const gate = Promise.withResolvers<void>();
	const { runtime, scheduler } = setup({
		pull: async () => ({ kind: 'complete' }),
		writes: async () => {
			runtime.deferWrite('before-stop');
			await gate.promise;
			runtime.deferWrite('after-stop');
			return { kind: 'failure', message: 'Response lost' };
		}
	});
	const flushing = runtime.flushWrites();
	runtime.stop();
	gate.resolve();
	await flushing;
	await scheduler.advance(60000);
	expect({ status: runtime.writeStatus, retries: [...runtime.excludedWrites()] }).toEqual({
		status: { kind: 'stopped' },
		retries: []
	});
});
