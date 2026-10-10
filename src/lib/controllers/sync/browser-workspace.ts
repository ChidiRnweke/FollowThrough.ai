import { OutboxAccountChangedError } from '$lib/errors';
import type {
	AccountWriterLock,
	CacheStorage,
	OutboxStorage,
	OutboxTable,
	OutboxTransaction,
	OutboxTransport,
	SyncReadTransport,
	WorkspaceLocalRepository
} from '$lib/models/browser-workspace';
import type { OutboxEntry, OutboxProjection, WriteOutcome, WriteReceipt } from '$lib/models/outbox';
import {
	initialSyncCursor,
	type CacheCommit,
	type ResourceState,
	type StoredCache,
	type SubmissionResult,
	type SynchronizationResult,
	type SyncLane,
	type SyncScheduler,
	type TransferState
} from '$lib/models/sync';
import { widgetCatalog, type WidgetCandidateReader } from '$lib/models/widgets';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { IWriteAncestryService } from '$lib/services/sync/ancestry';
import type { IWorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import type { ISyncSchedulingService } from '$lib/services/sync/scheduling';
import type { ICacheCommitService } from '$lib/services/sync/state';
import {
	receiveResource,
	resourceCurrent,
	resourceVersion,
	type IOutboxDeliveryService,
	type IOutboxEditingService
} from '$lib/services/sync/state';
import type { IWidgetEditingService } from '$lib/services/widgets/edits';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';
import type { ResourceCacheStateAccess } from '$lib/stores/sync/cache';
import type { SyncExecutionStateAccess } from '$lib/stores/sync/execution';
import type { MutationQueueStateAccess } from '$lib/stores/sync/submission';
import type { WorkspaceProjectionStateAccess } from '$lib/stores/workspace/projection.svelte';
import type { WorkspaceResourceStateAccess } from '$lib/stores/workspace/resources.svelte';
export interface BrowserWorkspaceAccount {
	readonly accountId: string;
	readonly repository: WorkspaceLocalRepository<WorkspaceCommand, WorkspaceRecord>;
	readonly outbox: OutboxStorage<WorkspaceCommand, WorkspaceRecord>;
	readonly cacheStorage: CacheStorage<WorkspaceRecord>;
	readonly readTransport: SyncReadTransport<WorkspaceRecord>;
	readonly writeTransport: OutboxTransport<WorkspaceCommand, WorkspaceRecord>;
	readonly writerLock: AccountWriterLock;
	readonly scheduler: SyncScheduler;
	readonly resourceState: WorkspaceResourceStateAccess;
	readonly projectionState: WorkspaceProjectionStateAccess;
	readonly cacheState: ResourceCacheStateAccess<WorkspaceRecord>;
	readonly queueState: MutationQueueStateAccess<WorkspaceCommand, WorkspaceRecord>;
	readonly executionState: SyncExecutionStateAccess;
	readonly ancestry: IWriteAncestryService;
	readonly cacheMerge: ICacheCommitService;
	readonly editing: IOutboxEditingService;
	readonly delivery: IOutboxDeliveryService;
	readonly scheduling: ISyncSchedulingService;
	readonly fields: IWorkspaceFieldReplayService;
	readonly widgetPatches: IWidgetPatchService;
	readonly widgetReader: WidgetCandidateReader;
	readonly widgetEditing: IWidgetEditingService;
}
export interface BrowserWorkspaceSynchronizationController {
	readonly online: boolean;
	readonly stopped: boolean;
	readonly writeStatus: SubmissionResult;
	readonly failure: string | null;
	setOnline(online: boolean): void;
	stop(): void;
	retryNow(): void;
	excludedWrites(): ReadonlySet<string>;
	deferWrite(id: string): void;
	clearWriteRetry(id: string): void;
	retainWriteRetries(ids: ReadonlySet<string>): void;
	flushWrites(force?: boolean): Promise<SubmissionResult>;
	synchronize(force?: boolean): Promise<void>;
	committed(): void;
	changed(): void;
}
export class BrowserWorkspaceSynchronization implements BrowserWorkspaceSynchronizationController {
	constructor(private readonly account: BrowserWorkspaceAccount) {}
	get online(): boolean {
		return this.executionOnline;
	}
	get stopped(): boolean {
		return this.executionStopped;
	}
	get writeStatus(): SubmissionResult {
		return this.executionWriteStatus;
	}
	get failure(): string | null {
		return this.executionFailure;
	}
	setOnline(online: boolean): void {
		return this.executionSetOnline(online);
	}
	stop(): void {
		return this.executionStop();
	}
	retryNow(): void {
		return this.executionRetryNow();
	}
	excludedWrites(): ReadonlySet<string> {
		return this.executionExcludedWrites();
	}
	deferWrite(id: string): void {
		return this.executionDeferWrite(id);
	}
	clearWriteRetry(id: string): void {
		return this.executionClearWriteRetry(id);
	}
	retainWriteRetries(ids: ReadonlySet<string>): void {
		return this.executionRetainWriteRetries(ids);
	}
	flushWrites(force?: boolean): Promise<SubmissionResult> {
		return this.executionFlushWrites(force);
	}
	synchronize(force?: boolean): Promise<void> {
		return this.executionSynchronize(force);
	}
	committed(): void {
		return this.executionCommitted();
	}
	changed(): void {
		return this.executionChanged();
	}
	private outboxSnapshot(accountId: string) {
		return this.account.outbox.snapshot(accountId);
	}
	private async outboxTake(
		accountId: string,
		excluded: ReadonlySet<string> = new Set()
	): Promise<OutboxEntry<WorkspaceCommand, WorkspaceRecord> | null> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => {
			const next = this.account.delivery.next(entries, excluded);
			if (!next) return { entries, result: null };
			const sent = this.account.delivery.begin(next);
			return { entries: entries.map((entry) => (entry === next ? sent : entry)), result: sent };
		});
	}
	private async outboxRetry(
		accountId: string,
		operationId: string,
		message: string
	): Promise<void> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				entry.intent.operationId === operationId
					? this.account.delivery.fail(entry, message)
					: entry
			),
			result: undefined
		}));
	}
	private async outboxRecover(accountId: string): Promise<void> {
		return this.outboxChange(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				this.account.delivery.fail(entry, 'Interrupted submission; checking its operation proof')
			),
			result: undefined
		}));
	}
	private async outboxSettle(
		accountId: string,
		sent: OutboxEntry<WorkspaceCommand, WorkspaceRecord>,
		outcome: WriteOutcome<WorkspaceRecord>
	): Promise<void> {
		return this.outboxChange(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const settled = this.account.delivery.settle(entries, sent.intent.operationId, outcome);
			const next =
				outcome.kind === 'conflict'
					? this.ancestryConflicted(settled, sent.intent.operationId)
					: settled;
			if (outcome.kind === 'applied') {
				const previous = await tx.receipt(sent.intent.key);
				const receipt = this.account.delivery.retainReceipt(previous, outcome.receipt);
				await tx.putReceipt(sent.intent.key, receipt);
			}
			const resource = this.account.delivery.authoritativeResource(outcome);
			if (resource) await this.outboxSaveResource(sent.intent.key, resource, tx);
			return { entries: next, result: undefined };
		});
	}
	private async outboxSaveResource(
		key: string,
		resource: WriteReceipt<WorkspaceRecord>['resource'],
		tx: OutboxTransaction<WorkspaceCommand, WorkspaceRecord>
	): Promise<void> {
		const current = await tx.resource(key);
		await tx.putResource(
			key,
			receiveResource(current, resource.kind === 'found' ? resource.snapshot : resource)
		);
	}
	private outboxChange<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (
			entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[],
			tx: OutboxTransaction<WorkspaceCommand, WorkspaceRecord>
		) => Promise<{ entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[]; result: R }>
	): Promise<R> {
		return this.account.outbox.transaction(accountId, tables, async (tx) => {
			const previous = await tx.entries();
			const change = await work(previous, tx);
			await tx.replace(previous, change.entries);
			return change.result;
		});
	}
	private async persistenceCommit(
		accountId: string,
		changes: CacheCommit<WorkspaceRecord>
	): Promise<void> {
		await this.account.cacheStorage.transaction(accountId, async (tx) => {
			const keys = [...changes.put.map((row) => row.key), ...changes.remove.map((row) => row.key)];
			const previous = await tx.resources(keys);
			const checkpoint = changes.cursor === undefined ? null : await tx.checkpoint();
			const decision = this.account.cacheMerge.decide(previous, checkpoint, changes);
			await tx.put(decision.put);
			await tx.remove(decision.remove);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
		});
	}
	private cacheInitialize(): Promise<void> {
		const existing = this.account.cacheState.read().initializing;
		if (existing) return existing;
		const initializing = this.cacheRestore().catch((error) => {
			this.account.cacheState.update({ initializing: null });
			throw error;
		});
		this.account.cacheState.update({ initializing });
		return initializing;
	}
	private async cacheReload(): Promise<void> {
		await this.cacheInitialize();
		await this.cacheRestore();
	}
	private cacheRefresh(): Promise<SynchronizationResult> {
		const existing = this.account.cacheState.read().checking;
		if (existing) return existing;
		const checking = this.cachePullChanges().finally(() => {
			if (this.account.cacheState.read().checking !== checking) return;
			this.account.cacheState.update({ checking: null });
		});
		this.account.cacheState.update({ checking });
		return checking;
	}
	private cacheEntry(key: string): ResourceState<WorkspaceRecord> | undefined {
		return this.account.cacheState.read().entries.get(key);
	}
	private cacheTransfer(key: string): TransferState | undefined {
		const attempt = this.account.cacheState.attempts().get(key);
		return !resourceCurrent(this.cacheEntry(key)) &&
			this.cacheEntry(key)?.kind !== 'deleted' &&
			attempt?.target === resourceVersion(this.cacheEntry(key))
			? attempt?.transfer
			: undefined;
	}
	private cacheNotify(): void {
		for (const listener of this.account.cacheState.listeners()) listener();
	}
	private async cacheRestore(): Promise<void> {
		const generation = this.account.cacheState.read().readGeneration + 1;
		this.account.cacheState.update({ readGeneration: generation });
		const stored = await this.account.cacheStorage.load(this.account.accountId);
		if (generation === this.account.cacheState.read().readGeneration) this.cacheApplyStored(stored);
	}
	private cacheApplyStored(
		{ records, cursor, inventoryComplete }: StoredCache<WorkspaceRecord>,
		notify = true
	): void {
		if (this.account.cacheState.read().stopped) return;
		this.account.cacheState.update({
			readGeneration: this.account.cacheState.read().readGeneration + 1,
			initializing: this.account.cacheState.read().initializing ?? Promise.resolve(),
			cursor,
			inventoryComplete,
			entries: new Map(records.map(({ key, entry }) => [key, entry]))
		});
		for (const key of this.account.cacheState.attempts().keys())
			if (!this.cacheTransfer(key)) this.account.cacheState.removeAttempt(key);
		if (notify) this.cacheNotify();
	}
	private async cacheCommit(compute: () => CacheCommit<WorkspaceRecord>): Promise<void> {
		if (this.account.cacheState.read().stopped) return;
		await this.persistenceCommit(this.account.accountId, {
			...compute()
		});
		await this.cacheRestore();
	}
	private async cachePullChanges(): Promise<SynchronizationResult> {
		try {
			await this.cacheReload();
			if (this.account.cacheState.read().stopped) return { kind: 'stopped' };
			if (!this.account.cacheState.read().online) return { kind: 'offline' };
			let more: boolean;
			do {
				const before = this.account.cacheState.read().cursor ?? initialSyncCursor;
				const batch = await this.account.readTransport.pull(before);
				more = batch.hasMore;
				if (more && BigInt(batch.cursor) <= BigInt(before))
					throw new Error('The server page did not advance its checkpoint');
				await this.cacheCommit(() => {
					if (
						BigInt(batch.cursor) <
						BigInt(this.account.cacheState.read().cursor ?? initialSyncCursor)
					)
						throw new Error('The server change cursor moved backwards');
					const put = batch.records.map(({ key, resource }) => ({
						key,
						entry: receiveResource<WorkspaceRecord>(
							undefined,
							resource.kind === 'found' ? resource.snapshot : resource
						)
					}));
					return {
						put,
						remove: [],
						cursor: batch.cursor,
						inventoryComplete: this.account.cacheState.read().inventoryComplete || !more
					};
				});
				if (!this.account.cacheState.read().online) return { kind: 'offline' };
			} while (more && !this.account.cacheState.read().stopped);
			if (this.account.cacheState.read().stopped) return { kind: 'stopped' };
			this.account.cacheState.update({ result: { kind: 'complete' } });
			this.cacheNotify();
			return this.account.cacheState.read().result;
		} catch (error) {
			if (this.account.cacheState.read().stopped) return { kind: 'stopped' };
			const message = error instanceof Error ? error.message : 'Change synchronization failed';
			this.account.cacheState.update({ result: { kind: 'failure', message } });
			this.cacheNotify();
			return { kind: 'failure', message };
		}
	}
	private get executionOnline(): boolean {
		return this.account.executionState.online;
	}
	private get executionStopped(): boolean {
		return this.account.executionState.stopped;
	}
	private get executionWriteStatus(): SubmissionResult {
		return this.executionStopped
			? { kind: 'stopped' }
			: !this.executionOnline
				? { kind: 'offline' }
				: this.account.executionState.lane('writes').result;
	}
	private get executionFailure(): string | null {
		for (const lane of Object.values(this.executionLanes()))
			if (lane.result.kind === 'failure') return lane.result.message;
		return null;
	}
	private executionSetOnline(online: boolean): void {
		if (this.executionStopped) return;
		this.account.executionState.setOnline(online);
		this.executionSchedule();
	}
	private executionStop(): void {
		this.account.executionState.stop();
		this.account.executionState.takeWake()?.();
	}
	private executionRetryNow(): void {
		if (this.executionStopped) return;
		for (const [id, retry] of this.account.executionState.writeRetries())
			this.account.executionState.setWriteRetry(id, { ...retry, at: 0 });
		for (const lane of ['pull', 'writes'] as const)
			this.account.executionState.updateLane(lane, { retry: null });
	}
	private executionExcludedWrites(): ReadonlySet<string> {
		return this.account.scheduling.excludedWrites(
			this.account.executionState.writeRetries(),
			this.account.scheduler.now()
		);
	}
	private executionDeferWrite(id: string): void {
		if (this.executionStopped) return;
		const attempts = (this.account.executionState.writeRetries().get(id)?.attempts ?? 0) + 1;
		this.account.executionState.setWriteRetry(id, {
			attempts,
			at: this.account.scheduling.retryAt(attempts, this.account.scheduler.now())
		});
	}
	private executionClearWriteRetry(id: string): void {
		this.account.executionState.deleteWriteRetry(id);
	}
	private executionRetainWriteRetries(ids: ReadonlySet<string>): void {
		for (const id of this.account.executionState.writeRetries().keys())
			if (!ids.has(id)) this.account.executionState.deleteWriteRetry(id);
	}
	private async executionFlushWrites(force = false): Promise<SubmissionResult> {
		if (force) this.executionRetryNow();
		await this.executionRequest('writes');
		return this.executionWriteStatus;
	}
	private async executionSynchronize(force = false): Promise<void> {
		if (force) this.executionRetryNow();
		await Promise.all([this.executionRequest('pull'), this.executionRequest('writes')]);
	}
	private executionCommitted(): void {
		void this.executionRequest('pull');
	}
	private executionChanged(): void {
		if (this.executionStopped) return;
		this.account.executionState.updateLane('writes', { retry: null });
		void this.executionRequest('writes');
	}
	private executionLanes() {
		return {
			pull: this.account.executionState.lane('pull'),
			writes: this.account.executionState.lane('writes')
		};
	}
	private executionRequest(lane: SyncLane): Promise<void> {
		if (this.executionStopped) return Promise.resolve();
		this.account.executionState.updateLane(lane, { requested: true });
		const state = this.account.executionState.lane(lane);
		if (this.executionStopped || !this.executionOnline) return Promise.resolve();
		if (state.retry !== null && state.retry > this.account.scheduler.now())
			return Promise.resolve();
		if (state.running) return state.running;
		const running = Promise.resolve()
			.then(async () => {
				await this.executionRun(lane);
			})
			.finally(() => {
				if (
					this.account.executionState.lane(lane).running !== running ||
					this.account.executionState.stopped
				)
					return;
				this.account.executionState.updateLane(lane, { running: null });
				this.executionSchedule();
				const latest = this.account.executionState.lane(lane);
				if (
					latest.requested &&
					latest.retry === null &&
					!this.executionStopped &&
					this.executionOnline
				)
					void this.executionRequest(lane);
			});
		this.account.executionState.updateLane(lane, { running });
		return running;
	}
	private async executionRun(lane: SyncLane): Promise<void | { kind: 'failure' }> {
		do {
			this.account.executionState.updateLane(lane, { requested: false, retry: null });
			let operationFailure = false;
			try {
				if (this.executionStopped || !this.executionOnline) return;
				const result = await (lane === 'pull' ? this.cacheRefresh() : this.queueSubmit());
				if (this.executionStopped) return;
				this.account.executionState.updateLane(lane, { result });
				if (result.kind === 'failure') {
					operationFailure =
						lane === 'writes' && this.account.executionState.writeRetries().size > 0;
					throw new Error(result.message);
				}
				if (result.kind === 'waiting') this.executionDeferLane(lane);
				else this.account.executionState.updateLane(lane, { failures: 0 });
				this.accountFailureChanged();
			} catch (error) {
				if (this.executionStopped) return;
				this.account.executionState.updateLane(lane, {
					result: {
						kind: 'failure',
						message: error instanceof Error ? error.message : 'Workspace synchronization failed'
					}
				});
				if (!operationFailure) this.executionDeferLane(lane);
				this.accountFailureChanged();
				return { kind: 'failure' };
			}
		} while (
			this.account.executionState.lane(lane).requested &&
			!this.executionStopped &&
			this.executionOnline
		);
	}
	private executionDeferLane(lane: SyncLane): void {
		const failures = this.account.executionState.lane(lane).failures + 1;
		this.account.executionState.updateLane(lane, {
			failures,
			retry: this.account.scheduling.retryAt(failures, this.account.scheduler.now())
		});
	}
	private executionSchedule(): void {
		this.account.executionState.takeWake()?.();
		if (this.executionStopped || !this.executionOnline) return;
		const at = this.account.scheduling.wakeAt(
			this.executionLanes(),
			this.account.executionState.writeRetries()
		);
		if (at === null) return;
		const wakeVersion = this.account.executionState.wakeVersion;
		this.account.executionState.setWake(
			this.account.scheduler.schedule(at, async () => {
				if (
					this.account.executionState.stopped ||
					this.account.executionState.wakeVersion !== wakeVersion
				)
					return;
				this.account.executionState.setWake(null);
				const due = this.account.scheduling.dueLanes(
					this.executionLanes(),
					this.account.executionState.writeRetries(),
					this.account.scheduler.now()
				);
				await Promise.all(due.map((lane) => this.executionRequest(lane)));
			})
		);
	}
	private get queueOnline() {
		return this.executionOnline;
	}
	private get queueStopped() {
		return this.executionStopped;
	}
	private async queueReload(): Promise<void> {
		const generation = this.account.queueState.advanceGeneration();
		const state = await this.outboxSnapshot(this.account.accountId);
		if (generation === this.account.queueState.reloadGeneration) this.queueApplyStored(state);
	}
	private queueApplyStored(
		state: OutboxProjection<WorkspaceCommand, WorkspaceRecord>,
		notify = true
	): void {
		if (this.queueStopped) return;

		const retryable = new Set(
			state.entries
				.filter(
					(entry) =>
						entry.delivery.kind === 'retry' ||
						entry.delivery.kind === 'queued' ||
						entry.delivery.kind === 'sending'
				)
				.map((entry) => entry.intent.operationId)
		);
		this.executionRetainWriteRetries(retryable);
		this.account.queueState.replace(state);
		if (notify) this.queueNotify();
	}
	private async queueSubmit(): Promise<SubmissionResult> {
		if (this.queueStopped) return { kind: 'stopped' };
		await this.queueReload();
		if (this.queueStopped) return { kind: 'stopped' };
		if (!this.queueOnline) return { kind: 'offline' };
		const ownership = await this.account.writerLock.tryRun(
			this.account.accountId,
			async (): Promise<SubmissionResult> => {
				if (this.queueStopped) return { kind: 'stopped' };
				if (!this.queueOnline) return { kind: 'offline' };
				await this.outboxRecover(this.account.accountId);
				const excluded = new Set(this.executionExcludedWrites());
				let failure: SubmissionResult = { kind: 'complete' };
				while (!this.queueStopped && this.queueOnline) {
					const sent = await this.outboxTake(this.account.accountId, excluded);
					await this.queueReload();
					if (!sent) {
						if (this.account.delivery.next(this.account.queueState.read().entries, excluded))
							continue;
						const deferred = this.account.queueState
							.read()
							.entries.find((entry) => entry.delivery.kind === 'retry');
						return deferred?.delivery.kind === 'retry'
							? { kind: 'failure', message: deferred.delivery.message }
							: failure;
					}
					if (this.queueStopped) return { kind: 'stopped' };
					if (!this.queueOnline) return { kind: 'offline' };
					// Once taken, the input remains immutable even if the request's outcome is lost.
					const response = await this.queueSend(sent);
					if (response.kind === 'failure') {
						await this.outboxRetry(
							this.account.accountId,
							sent.intent.operationId,
							response.message
						);
						await this.queueReload();
						this.executionDeferWrite(sent.intent.operationId);
						excluded.add(sent.intent.operationId);
						failure = { kind: 'failure', message: response.message };
						if (response.accountChanged) {
							this.executionSetOnline(false);
							return failure;
						}
						continue;
					}
					const outcome = response.outcome;
					await this.outboxSettle(this.account.accountId, sent, outcome);
					this.executionClearWriteRetry(sent.intent.operationId);
					if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.queueStopped)
						this.executionCommitted();
					await this.queueReload();
				}
				return this.queueStopped ? { kind: 'stopped' } : { kind: 'offline' };
			}
		);
		return ownership.kind === 'busy' ? { kind: 'waiting' } : ownership.value;
	}
	private async queueSend(
		sent: OutboxEntry<WorkspaceCommand, WorkspaceRecord>
	): Promise<
		| { kind: 'response'; outcome: WriteOutcome<WorkspaceRecord> }
		| { kind: 'failure'; message: string; accountChanged: boolean }
	> {
		try {
			const outcome = await this.account.writeTransport.send({
				operationId: sent.intent.operationId,
				baseEtag: sent.intent.base?.etag ?? null,
				command: sent.intent.command
			});
			return { kind: 'response', outcome };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Submission failed',
				accountChanged: error instanceof OutboxAccountChangedError
			};
		}
	}
	private queueNotify(): void {
		for (const listener of this.account.queueState.listeners()) listener();
	}
	private accountFailureChanged(): void {
		this.queueNotify();
	}
	private rebaseRecord(observed: WorkspaceRecord, local: WorkspaceRecord, onto: WorkspaceRecord) {
		if (observed.type !== onto.type || local.type !== onto.type) return null;

		if (observed.type === 'widgets' && local.type === 'widgets' && onto.type === 'widgets') {
			const { widgetPatches, widgetReader, widgetEditing } = this.account;
			const fields = this.account.fields.replay('widgets', observed.value, local.value, onto.value);
			const { overlaps, ...parts } = widgetPatches.rebaseParts(
				observed.value,
				local.value,
				onto.value
			);
			const candidate = { ...fields.value, ...parts };
			const read = widgetReader.read(candidate, widgetCatalog);
			const validation =
				read.kind === 'invalid' ? read : widgetEditing.decide(read.widget, read.issues);
			return {
				value: { type: 'widgets' as const, value: candidate },
				overlaps: fields.overlaps || overlaps || validation.kind !== 'applied'
			};
		}
		const rebased = this.account.fields.replay(onto.type, observed.value, local.value, onto.value);
		const record = structuredClone(onto);
		Object.assign(record.value, rebased.value);
		return { value: record, overlaps: rebased.overlaps };
	}
	private ancestryConflicted(
		entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[],
		operationId: string
	): readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[] {
		const conflict = this.account.ancestry.conflict(entries, operationId);
		if (!conflict) return entries;
		const rebased = this.rebaseRecord(conflict.observed, conflict.local, conflict.remote.value);
		if (!rebased || rebased.overlaps) return entries;
		const replayed = new Map<string, WorkspaceRecord>();
		let previous = { from: conflict.local, to: rebased.value };
		for (const entry of conflict.descendants) {
			const local = entry.intent.local;
			if (local === null) throw new Error('A deletion cannot be an ancestry replay descendant');
			const next = this.rebaseRecord(previous.from, local, previous.to);
			if (!next) continue;
			previous = { from: local, to: next.value };
			replayed.set(entry.intent.operationId, next.value);
		}
		return this.account.ancestry.acceptConflict(entries, conflict, rebased.value, replayed);
	}
}
