import type { OutboxStorage, OutboxTable, OutboxTransaction } from '$lib/models/browser-workspace';
import type {
	OutboxEntry,
	WriteBaseResolution,
	WriteDraft,
	WriteOutcome,
	WriteReceipt
} from '$lib/models/outbox';
import type { IOutboxDeliveryService, IOutboxEditingService } from '$lib/services/sync/state';
import { cachedSnapshot, receiveResource } from '$lib/services/sync/state';
import type { WriteAncestryController } from './ancestry';
import type { DurableWriteController } from './submission';
export type { OutboxStorage, OutboxTable, OutboxTransaction } from '$lib/models/browser-workspace';

/** All methods operate on the same live storage transaction. */

/** Every read, domain decision and write stays inside the unit of work. */
export class DurableOutbox<C, T> implements DurableWriteController<C, T> {
	constructor(
		private readonly storage: OutboxStorage<C, T>,
		private readonly ancestry: WriteAncestryController<T>,
		private readonly editing: IOutboxEditingService,
		private readonly delivery: IOutboxDeliveryService
	) {}
	receipt(accountId: string, key: string) {
		return this.storage.receipt(accountId, key);
	}
	snapshot(accountId: string) {
		return this.storage.snapshot(accountId);
	}
	list(accountId: string) {
		return this.storage.list(accountId);
	}
	async append(accountId: string, draft: WriteDraft<C, T>): Promise<string> {
		draft = this.storage.readDraft(draft);
		return this.change(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const receipt = await tx.receipt(draft.key);
			const rebased = this.ancestry.draft(entries, draft, receipt);
			const current = await tx.resource(draft.key);
			const snapshot = cachedSnapshot(current);
			const observed =
				current?.kind === 'deleted'
					? current
					: snapshot
						? { kind: 'found' as const, snapshot }
						: { kind: 'unavailable' as const };
			// IndexedDB allocates order in the same transaction as the final intent. An abort also rolls back allocation.
			const sequence = await tx.allocate(rebased);
			const next = this.editing.append(entries, rebased, sequence, receipt, observed);
			const appended = next.find((entry) => entry.intent.operationId === draft.operationId);
			if (!appended) throw new Error('The queued resource was not appended');
			if (appended.sequence !== sequence) await tx.removeAllocated(sequence);
			return { entries: next, result: appended.intent.operationId };
		});
	}
	async resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void> {
		return this.change(accountId, ['outbox', 'records'], async (entries, tx) => {
			const original = entries.find((entry) => entry.intent.operationId === operationId);
			if (original && resolution.remote.kind !== 'unavailable')
				await this.saveResource(original.intent.key, resolution.remote, tx);
			return {
				entries: this.editing.resolveBase(entries, operationId, resolution),
				result: undefined
			};
		});
	}
	async keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: this.editing.keepLocal(entries, operationId, replacementId),
			result: undefined
		}));
	}
	async discard(accountId: string, operationIds: readonly string[]): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: this.editing.discard(entries, operationIds),
			result: undefined
		}));
	}
	async take(
		accountId: string,
		excluded: ReadonlySet<string> = new Set()
	): Promise<OutboxEntry<C, T> | null> {
		return this.change(accountId, ['outbox'], async (entries) => {
			const next = this.delivery.next(entries, excluded);
			if (!next) return { entries, result: null };
			const sent = this.delivery.begin(next);
			return { entries: entries.map((entry) => (entry === next ? sent : entry)), result: sent };
		});
	}
	async retry(accountId: string, operationId: string, message: string): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				entry.intent.operationId === operationId ? this.delivery.fail(entry, message) : entry
			),
			result: undefined
		}));
	}
	async recover(accountId: string): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				this.delivery.fail(entry, 'Interrupted submission; checking its operation proof')
			),
			result: undefined
		}));
	}
	async settle(
		accountId: string,
		sent: OutboxEntry<C, T>,
		outcome: WriteOutcome<T>
	): Promise<void> {
		return this.change(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const settled = this.delivery.settle(entries, sent.intent.operationId, outcome);
			const next =
				outcome.kind === 'conflict'
					? this.ancestry.conflicted(settled, sent.intent.operationId)
					: settled;
			if (outcome.kind === 'applied') {
				const previous = await tx.receipt(sent.intent.key);
				const receipt = this.delivery.retainReceipt(previous, outcome.receipt);
				await tx.putReceipt(sent.intent.key, receipt);
			}
			const resource = this.delivery.authoritativeResource(outcome);
			if (resource) await this.saveResource(sent.intent.key, resource, tx);
			return { entries: next, result: undefined };
		});
	}
	private async saveResource(
		key: string,
		resource: WriteReceipt<T>['resource'],
		tx: OutboxTransaction<C, T>
	): Promise<void> {
		const current = await tx.resource(key);
		await tx.putResource(
			key,
			receiveResource(current, resource.kind === 'found' ? resource.snapshot : resource)
		);
	}

	private change<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (
			entries: readonly OutboxEntry<C, T>[],
			tx: OutboxTransaction<C, T>
		) => Promise<{ entries: readonly OutboxEntry<C, T>[]; result: R }>
	): Promise<R> {
		return this.storage.transaction(accountId, tables, async (tx) => {
			const previous = await tx.entries();
			const change = await work(previous, tx);
			await tx.replace(previous, change.entries);
			return change.result;
		});
	}
}
