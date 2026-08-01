import type { TransactionRunner } from '$lib/server/repositories/workspace';

export interface SnapshotParticipant {
	snapshot(): unknown;
	restore(snapshot: unknown): void;
}

export class InMemoryTransactionRunner implements TransactionRunner {
	constructor(private readonly participants: readonly SnapshotParticipant[]) {}

	async run<T>(work: () => Promise<T>): Promise<T> {
		const snapshots = this.participants.map((participant) => participant.snapshot());
		try {
			return await work();
		} catch (error) {
			this.participants.forEach((participant, index) => participant.restore(snapshots[index]));
			throw error;
		}
	}
}
