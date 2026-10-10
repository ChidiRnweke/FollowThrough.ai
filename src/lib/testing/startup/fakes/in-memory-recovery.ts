import type { StartupDependencies } from '$lib/server/controllers/startup/controller';

type RecoveryKind = keyof StartupDependencies;
/** Pending durable work becomes recovered only after its gate resolves. */
export class InMemoryRecovery
	implements
		Pick<StartupDependencies['agent'], 'recoverInterruptedRuns'>,
		Pick<StartupDependencies['todos'], 'recoverQueuedPromiseRuns'>,
		Pick<StartupDependencies['references'], 'recoverQueuedReferenceRuns'>,
		Pick<StartupDependencies['relationships'], 'recoverQueuedRelatedNoteRuns'>,
		Pick<StartupDependencies['diagrams'], 'recoverQueuedDiagramRuns'>
{
	readonly pending: Record<RecoveryKind, number> = {
		agent: 1,
		todos: 2,
		references: 3,
		relationships: 4,
		diagrams: 5
	};
	readonly recovered: Record<RecoveryKind, number> = {
		agent: 0,
		todos: 0,
		references: 0,
		relationships: 0,
		diagrams: 0
	};
	failure: { kind: RecoveryKind; error: Error } | undefined;
	gate: { kind: RecoveryKind; ready: Promise<void>; started(): void } | undefined;
	private async recover(kind: RecoveryKind): Promise<number> {
		if (this.gate?.kind === kind) {
			this.gate.started();
			await this.gate.ready;
		}
		if (this.failure?.kind === kind) throw this.failure.error;
		const count = this.pending[kind];
		this.pending[kind] = 0;
		this.recovered[kind] += count;
		return count;
	}
	recoverInterruptedRuns(): Promise<number> {
		return this.recover('agent');
	}
	recoverQueuedPromiseRuns(): Promise<number> {
		return this.recover('todos');
	}
	recoverQueuedReferenceRuns(): Promise<number> {
		return this.recover('references');
	}
	recoverQueuedRelatedNoteRuns(): Promise<number> {
		return this.recover('relationships');
	}
	recoverQueuedDiagramRuns(): Promise<number> {
		return this.recover('diagrams');
	}
}
