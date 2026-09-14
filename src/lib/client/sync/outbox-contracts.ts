import type {
	OutboxEntry,
	WriteDraft,
	WriteBaseResolution,
	WriteOutcome,
	WriteReceipt
} from '$lib/models/outbox';
import type { SyncEtag } from '$lib/models/sync';
import type { WriteRecovery } from '$lib/models/outbox';

export class OutboxAccountChangedError extends Error {}

export interface OutboxProjection<C, T> {
	readonly entries: readonly OutboxEntry<C, T>[];
	readonly receipts: ReadonlyMap<string, WriteReceipt<T>>;
}

export interface OutboxRepository<C, T> {
	snapshot(accountId: string): Promise<OutboxProjection<C, T>>;
	pendingAcknowledgements(accountId: string): Promise<readonly string[]>;
	acknowledged(accountId: string, operationId: string): Promise<void>;
	receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null>;
	list(accountId: string): Promise<readonly OutboxEntry<C, T>[]>;
	append(accountId: string, draft: WriteDraft<C, T>): Promise<string>;
	resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void>;
	keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void>;
	discard(accountId: string, operationIds: readonly string[]): Promise<void>;
	take(accountId: string, excluded?: ReadonlySet<string>): Promise<OutboxEntry<C, T> | null>;
	retry(accountId: string, operationId: string, message: string): Promise<void>;
	/** Call only after acquiring the account's exclusive writer lock. */
	recover(accountId: string): Promise<void>;
	/** Queue acknowledgement and the authoritative cached resource commit atomically. */
	settle(accountId: string, sent: OutboxEntry<C, T>, outcome: WriteOutcome<T>): Promise<void>;
}

export interface OutboxTransport<C, T> {
	readonly recovery?: {
		observe(key: string): Promise<import('$lib/models/outbox').ServerResource<T>>;
		cancel(input: {
			operationId: string;
			baseEtag: SyncEtag | null;
			command: C;
		}): Promise<WriteRecovery<T>>;
		acknowledge(operationId: string): Promise<void>;
	};
	send(input: {
		readonly operationId: string;
		readonly baseEtag: SyncEtag | null;
		readonly command: C;
	}): Promise<WriteOutcome<T>>;
}
