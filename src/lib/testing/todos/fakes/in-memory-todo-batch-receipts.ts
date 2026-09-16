import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	TodoBatchLookup
} from '$lib/models/todos';
import type { TodoBatchReceiptRepository } from '$lib/server/repositories/todos/batch-receipts';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryTodoBatchReceipts implements TodoBatchReceiptRepository, SnapshotParticipant {
	receipts = new Map<string, { input: CreateTodoBatchInput; result: CreateTodoBatchOutput }>();
	saveError?: Error;
	async lock(): Promise<void> {}
	async find(actor: ActorContext, input: CreateTodoBatchInput): Promise<TodoBatchLookup> {
		const previous = this.receipts.get(`${actor.userId}:${input.requestId}`);
		return !previous
			? { kind: 'missing' }
			: !isDeepStrictEqual(previous.input, input)
				? { kind: 'reused' }
				: { kind: 'saved', result: structuredClone(previous.result) };
	}
	async save(
		actor: ActorContext,
		input: CreateTodoBatchInput,
		result: CreateTodoBatchOutput
	): Promise<void> {
		if (this.saveError) throw this.saveError;
		const key = `${actor.userId}:${input.requestId}`;
		if (this.receipts.has(key)) throw new Error('Duplicate task batch receipt');
		this.receipts.set(key, structuredClone({ input, result }));
	}
	snapshot(): RestoreSnapshot {
		const receipts = structuredClone(this.receipts);
		return () => {
			this.receipts = receipts;
		};
	}
}
