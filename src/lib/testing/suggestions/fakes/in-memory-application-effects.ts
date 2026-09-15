import type { DateTime } from '$lib/models/workspace';
import type { ActorContext } from '$lib/models/identity';
import type { SuggestionId } from '$lib/models/suggestions';
import type {
	AppliedChange,
	ApplicationEffect,
	RecordedChange
} from '$lib/models/proposal-effects';
import type {
	AppliedRecord,
	ApplicationEffectRepository
} from '$lib/server/repositories/suggestions/application-effects';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';
import { ExternalServiceError, InvalidTransitionError } from '$lib/errors';

const key = (record: AppliedRecord) => `${record.type}:${record.value.id}`;
export class InMemoryApplicationEffects
	implements ApplicationEffectRepository, SnapshotParticipant
{
	readonly effects = new Map<SuggestionId, ApplicationEffect<AppliedRecord>>();
	readonly records = new Map<string, AppliedRecord>();
	readonly versions = new Map<string, number>();
	failRestore = false;
	put(record: AppliedRecord): void {
		this.records.set(key(record), structuredClone(record));
		this.versions.set(key(record), (this.versions.get(key(record)) ?? 0) + 1);
	}
	async lock(_actor: ActorContext, _id: SuggestionId): Promise<void> {}
	async find(
		_actor: ActorContext,
		id: SuggestionId
	): Promise<ApplicationEffect<AppliedRecord> | null> {
		return this.effects.get(id) ?? null;
	}
	async lockVersion(actor: ActorContext, record: AppliedRecord): Promise<string | null> {
		const stored = this.records.get(key(record));
		return stored?.value.userId === actor.userId
			? `sync-v1-${this.versions.get(key(record))}`
			: null;
	}
	async record(
		actor: ActorContext,
		id: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void> {
		const recorded: RecordedChange<AppliedRecord>[] = [];
		for (const change of changes) {
			const version = await this.lockVersion(actor, change.after);
			if (version === null)
				throw new InvalidTransitionError('An applied proposal participant is unavailable');
			recorded.push(change.kind === 'unchanged' ? change : { ...change, version });
		}
		this.effects.set(id, structuredClone({ changes: recorded }));
	}
	async restore(
		_actor: ActorContext,
		change: AppliedChange<AppliedRecord>
	): Promise<AppliedRecord> {
		if (this.failRestore) throw new ExternalServiceError('Recorded changes could not be restored');
		if (change.kind === 'unchanged') return change.after;
		let record = change.kind === 'modified' ? change.before : change.after;
		if (change.kind === 'created') {
			const timestamp = new Date().toISOString() as DateTime;
			switch (record.type) {
				case 'todos':
					record = {
						type: 'todos',
						value: { ...record.value, deletedAt: timestamp, updatedAt: timestamp }
					};
					break;
				case 'memory_entries':
					record = {
						type: 'memory_entries',
						value: { ...record.value, deletedAt: timestamp, updatedAt: timestamp }
					};
					break;
				case 'diagrams':
					record = {
						type: 'diagrams',
						value: { ...record.value, archivedAt: timestamp, updatedAt: timestamp }
					};
					break;
				default:
					this.records.delete(key(record));
					return record;
			}
		}
		this.put(record);
		return record;
	}
	snapshot(): RestoreSnapshot {
		const effects = structuredClone(this.effects),
			records = structuredClone(this.records),
			versions = structuredClone(this.versions);
		return () => {
			this.effects.clear();
			for (const [id, effect] of effects) this.effects.set(id, effect);
			this.records.clear();
			for (const [id, record] of records) this.records.set(id, record);
			this.versions.clear();
			for (const [id, version] of versions) this.versions.set(id, version);
		};
	}
}
