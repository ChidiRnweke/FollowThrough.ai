import {
	retryConflictedWrite,
	discardWrites,
	appendWrite,
	beginWrite,
	failWrite,
	nextWrite,
	settleWrite,
	resolveWriteBase,
	type WriteBaseResolution,
	type OutboxEntry,
	type WriteDraft,
	type WriteOutcome
} from '$lib/models/outbox';
import type { OutboxRepository } from '$lib/client/sync/outbox-contracts';
import type { AccountWriterLock } from '$lib/client/sync/mutation-queue';

export class InMemoryOutbox<C, T> implements OutboxRepository<C, T> {
	private readonly accounts = new Map<string, readonly OutboxEntry<C, T>[]>();
	private sequence = 0;
	async list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		return this.accounts.get(accountId) ?? [];
	}
	async append(accountId: string, draft: WriteDraft<C, T>): Promise<string> {
		const next = appendWrite(await this.list(accountId), draft, ++this.sequence);
		this.accounts.set(accountId, next);
		const appended = next.findLast((entry) => entry.intent.key === draft.key);
		if (!appended) throw new Error('The queued resource was not appended');
		return appended.intent.operationId;
	}
	async resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void> {
		this.accounts.set(
			accountId,
			resolveWriteBase(await this.list(accountId), operationId, resolution)
		);
	}

	async keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void> {
		this.accounts.set(
			accountId,
			retryConflictedWrite(await this.list(accountId), operationId, replacementId)
		);
	}
	async discard(accountId: string, operationIds: readonly string[]): Promise<void> {
		this.accounts.set(accountId, discardWrites(await this.list(accountId), operationIds));
	}

	async take(accountId: string): Promise<OutboxEntry<C, T> | null> {
		const entries = await this.list(accountId);
		const next = nextWrite(entries);
		if (!next) return null;
		const sent = beginWrite(next);
		this.accounts.set(
			accountId,
			entries.map((entry) => (entry === next ? sent : entry))
		);
		return sent;
	}
	async retry(accountId: string, operationId: string, message: string): Promise<void> {
		this.accounts.set(
			accountId,
			(await this.list(accountId)).map((entry) =>
				entry.intent.operationId === operationId ? failWrite(entry, message) : entry
			)
		);
	}
	async recover(accountId: string): Promise<void> {
		this.accounts.set(
			accountId,
			(await this.list(accountId)).map((entry) =>
				failWrite(entry, 'Interrupted submission; checking its receipt')
			)
		);
	}
	async settle(
		accountId: string,
		sent: OutboxEntry<C, T>,
		outcome: WriteOutcome<T>
	): Promise<void> {
		this.accounts.set(
			accountId,
			settleWrite(await this.list(accountId), sent.intent.operationId, outcome)
		);
	}
}

export class InMemoryAccountWriterLock implements AccountWriterLock {
	private readonly waiting = new Map<string, Promise<void>>();
	async run<T>(accountId: string, work: () => Promise<T>): Promise<T> {
		const previous = this.waiting.get(accountId) ?? Promise.resolve();
		const released = Promise.withResolvers<void>();
		this.waiting.set(accountId, released.promise);
		await previous;
		try {
			return await work();
		} finally {
			released.resolve();
			if (this.waiting.get(accountId) === released.promise) this.waiting.delete(accountId);
		}
	}
}
