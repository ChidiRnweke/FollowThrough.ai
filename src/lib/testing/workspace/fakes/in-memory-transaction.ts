import type { TransactionRunner } from '$lib/server/repositories/workspace';

/** Puts a participant back the way `snapshot` found it. */
export type RestoreSnapshot = () => void;

/**
 * A fake that can be rolled back when the work inside a transaction throws.
 *
 * `snapshot` answers with its own undo rather than with the captured state, so
 * the state never leaves the participant that owns it. The pair used to be
 * `snapshot(): unknown` / `restore(snapshot: unknown)`, which meant every
 * implementor asserted its own state back out of an `unknown` — eleven casts
 * for a value each of them had just produced. `restore(unknown)` also said the
 * fake would accept a snapshot it never wrote, which is a state production
 * cannot produce.
 */
export interface SnapshotParticipant {
	snapshot(): RestoreSnapshot;
}

export class InMemoryTransactionRunner implements TransactionRunner {
	constructor(private readonly participants: readonly SnapshotParticipant[]) {}

	async run<T>(work: () => Promise<T>): Promise<T> {
		const restores = this.participants.map((participant) => participant.snapshot());
		try {
			return await work();
		} catch (error) {
			for (const restore of restores) restore();
			throw error;
		}
	}
}
