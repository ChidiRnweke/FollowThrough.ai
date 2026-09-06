import type { OutboxEntry, WriteDraft, WriteOutcome } from '$lib/models/outbox';
import type { SyncEtag } from '$lib/models/sync';

export interface OutboxRepository<C, T> {
	list(accountId: string): Promise<readonly OutboxEntry<C, T>[]>;
	append(accountId: string, draft: WriteDraft<C, T>): Promise<string>;
	take(accountId: string): Promise<OutboxEntry<C, T> | null>;
	retry(accountId: string, operationId: string, message: string): Promise<void>;
	/** Call only after acquiring the account's exclusive writer lock. */
	recover(accountId: string): Promise<void>;
	/** Queue acknowledgement and the authoritative cached resource commit atomically. */
	settle(accountId: string, sent: OutboxEntry<C, T>, outcome: WriteOutcome<T>): Promise<void>;
}

export interface OutboxTransport<C, T> {
	send(input: {
		readonly operationId: string;
		readonly baseEtag: SyncEtag | null;
		readonly command: C;
	}): Promise<WriteOutcome<T>>;
}
