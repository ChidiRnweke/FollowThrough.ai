import { describe, expect, it } from 'vitest';
import { WorkspaceSyncRuntime, type WorkspaceSyncRuntimeDependencies } from './workspace-runtime';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';

const setup = (operations: Pick<WorkspaceSyncRuntimeDependencies, 'pull' | 'writes'>) => {
	const scheduler = new InMemorySyncScheduler();
	const runtime = new WorkspaceSyncRuntime({
		scheduler,
		initialize: async () => undefined,
		bodies: async () => ({ kind: 'complete' }),
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
			runtime.writeScheduler.schedule(60_000, async () => undefined);
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
	const runtime = new WorkspaceSyncRuntime({
		scheduler,
		initialize: async () => {
			if (unavailable) throw new Error('Unavailable');
		},
		pull: async () => ({ kind: 'complete' }),
		bodies: async () => ({ kind: 'complete' }),
		writes: async () => {
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
	const runtime = new WorkspaceSyncRuntime({
		scheduler,
		initialize: async () => undefined,
		pull: async () => {
			if (unavailable) throw new Error('Unavailable');
			return { kind: 'complete' };
		},
		bodies: async () => ({ kind: 'complete' }),
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
