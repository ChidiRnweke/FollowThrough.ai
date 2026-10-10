import { expect, it } from 'vitest';
import { Startup, type StartupDependencies } from './controller';
import { InMemoryRecovery } from '$lib/testing/startup/fakes/in-memory-recovery';

const kinds: readonly (keyof StartupDependencies)[] = [
	'agent',
	'todos',
	'references',
	'relationships',
	'diagrams'
];
const startup = (work: InMemoryRecovery) =>
	new Startup({ agent: work, todos: work, references: work, relationships: work, diagrams: work });
it('sums completed recoveries across all domains', async () => {
	expect(await startup(new InMemoryRecovery()).recoverInterruptedRuns()).toBe(15);
});
it('returns zero when all work has already recovered', async () => {
	const controller = startup(new InMemoryRecovery());
	await controller.recoverInterruptedRuns();
	expect(await controller.recoverInterruptedRuns()).toBe(0);
});
it.each(kinds)('waits for %s to complete before recovering subsequent work', async (kind) => {
	const work = new InMemoryRecovery();
	const started = Promise.withResolvers<void>();
	const ready = Promise.withResolvers<void>();
	work.gate = { kind, started: started.resolve, ready: ready.promise };
	const recovery = startup(work).recoverInterruptedRuns();
	await started.promise;
	const pending = { ...work.pending };
	ready.resolve();
	await recovery;
	expect(pending).toEqual(
		Object.fromEntries(
			kinds.map((name, index) => [name, index < kinds.indexOf(kind) ? 0 : index + 1])
		)
	);
});
it.each(kinds)('propagates a %s failure without consuming later work', async (kind) => {
	const work = new InMemoryRecovery();
	const error = new Error('Recovery storage unavailable');
	work.failure = { kind, error };
	const outcome = await startup(work)
		.recoverInterruptedRuns()
		.then(
			(count) => ({ kind: 'success', count }),
			(failure) => ({ kind: 'failure', failure, pending: work.pending })
		);
	expect(outcome).toEqual({
		kind: 'failure',
		failure: error,
		pending: Object.fromEntries(
			kinds.map((name, index) => [name, index < kinds.indexOf(kind) ? 0 : index + 1])
		)
	});
});
