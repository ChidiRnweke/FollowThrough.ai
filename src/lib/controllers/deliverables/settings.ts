import type {
	DeliverableAccount,
	DeliverableSession,
	DeliverableEnvironment,
	DeliverableOperation
} from '$lib/models/browser-deliverables';
import type { WorkspaceCapabilityRegistry } from '$lib/stores/workspace/capabilities';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	initialSyncCursor,
	type SynchronizationResult,
	type SyncPage,
	type CachedRecord
} from '$lib/models/sync';
import type { ICacheCommitService, IWorkspaceProjectionService } from '$lib/services/sync/state';

import {
	defaultExportSettings,
	type ExportSettings,
	type ExportSettingsLoad
} from '$lib/models/deliverables';
import type { WorkspaceEditingEnvironment } from '$lib/models/browser-workspace';
import type { UserId } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WriteDraft, OutboxEntry, WriteReceipt } from '$lib/models/outbox';
import type { WorkspaceEditContext } from '$lib/models/workspace-editing';
import type { ExportSettingsStore } from '$lib/stores/deliverables/settings.svelte';
import type { ExportSettingsRules } from '$lib/services/deliverables/settings';
import type { IWorkspaceDraftService } from '$lib/services/workspace/draft';
import type { IWriteAncestryService } from '$lib/services/sync/ancestry';
import type { IWorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import type { IOutboxEditingService } from '$lib/services/sync/state';
import { cachedSnapshot, compareSyncEtags } from '$lib/services/sync/state';
import {
	workspaceResourceKey,
	assertWorkspaceWriteIdentity
} from '$lib/services/workspace/commands';
export type ExportSettingsSave =
	| { readonly kind: 'saved' | 'superseded' }
	| { readonly kind: 'failure'; readonly message: string };
export interface ProjectExportSettingsController {
	readonly ready: boolean;
	readonly busy: boolean;
	readonly sessionGeneration: number;
	readonly accountId: string | null;
	open(projectId: string): Promise<ExportSettingsLoad>;
	save(settings: ExportSettings): Promise<ExportSettingsSave>;
	close(): void;
}
export interface ProjectExportSettingsDependencies {
	readonly session: DeliverableSession;
	readonly environment: DeliverableEnvironment;
	readonly accounts: WorkspaceCapabilityRegistry<DeliverableAccount>;
	readonly snapshots: WorkspaceEditingEnvironment;
	readonly cacheMerge: ICacheCommitService;
	readonly projection: IWorkspaceProjectionService;
	readonly rules: ExportSettingsRules;
	readonly drafts: IWorkspaceDraftService;
	readonly ancestry: IWriteAncestryService;
	readonly fields: IWorkspaceFieldReplayService;
	readonly editing: IOutboxEditingService;
}
export class ProjectExportSettings implements ProjectExportSettingsController {
	constructor(
		private readonly state: ExportSettingsStore,
		private readonly dependencies: ProjectExportSettingsDependencies
	) {}
	get sessionGeneration(): number {
		return this.dependencies.session.generation;
	}
	get accountId(): string | null {
		return this.dependencies.environment.accountId;
	}
	get ready(): boolean {
		const binding = this.state.binding;
		if (
			!binding ||
			this.dependencies.session.resourceBinding?.resourceKey !== binding.workspace.resourceKey
		)
			return false;
		return (
			binding !== null &&
			this.state.draft !== null &&
			this.current({
				binding: binding.workspace,
				account: this.dependencies.accounts.get(binding.workspace.resourceKey),
				generation: this.state.generation
			})
		);
	}
	get busy(): boolean {
		return this.ready && this.state.busy;
	}
	async open(projectId: string): Promise<ExportSettingsLoad> {
		this.close();
		const generation = this.state.generation;
		let operation: DeliverableOperation | undefined;
		try {
			operation = this.capture(generation);
			this.state.bind({ workspace: operation.binding, projectId });
			const key = workspaceResourceKey({
				type: 'export_settings',
				id: [operation.binding.accountId, projectId]
			});
			const { local, records } = await this.readLocal(operation, key);
			const record = records.get(key);
			if (record && record.type !== 'export_settings')
				throw new Error('The export defaults have the wrong resource type');
			const timestamp = this.dependencies.snapshots.now();
			const context: WorkspaceEditContext = record
				? this.dependencies.drafts.editBase(
						local.writes.entries,
						key,
						cachedSnapshot(local.cache.records.find((row) => row.key === key)?.entry)
					)
				: {
						base: null,
						basedOn: null,
						local: {
							type: 'export_settings',
							value: {
								userId: operation.binding.accountId as UserId,
								projectId: projectId as ProjectId,
								settings: { ...defaultExportSettings },
								createdAt: timestamp,
								updatedAt: timestamp
							}
						}
					};
			this.requireCurrent(operation);
			this.state.setDraft(context);
			return {
				kind: 'ready',
				settings: { ...defaultExportSettings, ...(record?.value.settings ?? {}) }
			};
		} catch (error) {
			if (generation !== this.state.generation || (operation && !this.current(operation)))
				return { kind: 'superseded' };
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Export defaults could not be loaded'
			};
		}
	}
	async save(settings: ExportSettings): Promise<ExportSettingsSave> {
		if (!this.ready || this.busy) return { kind: 'superseded' };
		const context = this.state.draft;
		if (!context || context.local.type !== 'export_settings')
			return { kind: 'failure', message: 'The export defaults are unavailable' };
		const operation = this.capture(this.state.generation);
		this.state.setBusy(true);
		try {
			const value = context.local.value;
			const input = this.dependencies.snapshots.snapshot(settings);
			const command: WorkspaceCommand = {
				kind: 'updateExportSettings',
				userId: value.userId,
				projectId: value.projectId,
				settings: input
			};
			const draft: WriteDraft<WorkspaceCommand, WorkspaceRecord> = {
				command,
				local: {
					type: 'export_settings',
					value: {
						...value,
						settings: this.dependencies.rules.validate(input),
						updatedAt: this.dependencies.snapshots.now()
					}
				},
				operationId: this.dependencies.snapshots.operationId(),
				key: workspaceResourceKey({ type: 'export_settings', id: [value.userId, value.projectId] }),
				base: context.base,
				basedOn: context.basedOn,
				coalesce: null,
				references: [workspaceResourceKey({ type: 'projects', id: [value.projectId] })]
			};
			assertWorkspaceWriteIdentity(draft);
			const parsed = operation.account.outbox.readDraft(draft);
			const staged = await operation.account.outbox.transaction(
				operation.binding.accountId,
				['outbox', 'records', 'receipts'],
				async (tx) => {
					this.requireCurrent(operation);
					const previous = await tx.entries();
					const receipt = await tx.receipt(parsed.key);
					const current = await tx.resource(parsed.key);
					this.requireCurrent(operation);
					const rebased = this.rebase(previous, parsed, receipt);
					const sequence = await tx.allocate(rebased);
					const snapshot = cachedSnapshot(current);
					const observed =
						current?.kind === 'deleted'
							? current
							: snapshot
								? { kind: 'found' as const, snapshot }
								: { kind: 'unavailable' as const };
					const next = this.dependencies.editing.append(
						previous,
						rebased,
						sequence,
						receipt,
						observed
					);
					const appended = next.find((entry) => entry.intent.operationId === draft.operationId);
					if (!appended?.intent.local) throw new Error('The export defaults were not appended');
					if (appended.sequence !== sequence) await tx.removeAllocated(sequence);
					this.requireCurrent(operation);
					await tx.replace(previous, next);
					this.requireCurrent(operation);
					return {
						base: appended.intent.base,
						basedOn: appended.intent.operationId,
						local: appended.intent.local
					};
				}
			);
			if (!this.current(operation)) return { kind: 'superseded' };
			// The existing account repository observer wakes the sender after the durable commit.
			this.state.setDraft(staged);
			return { kind: 'saved' };
		} catch (error) {
			if (!this.current(operation)) return { kind: 'superseded' };
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Could not save the export defaults.'
			};
		} finally {
			if (operation.generation === this.state.generation) this.state.setBusy(false);
		}
	}
	private rebase(
		entries: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[],
		draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>,
		receipt: WriteReceipt<WorkspaceRecord> | null
	): WriteDraft<WorkspaceCommand, WorkspaceRecord> {
		const newer =
			receipt?.resource.kind === 'found' &&
			draft.base !== null &&
			compareSyncEtags(receipt.resource.snapshot.etag, draft.base.etag) > 0;
		const decision = this.dependencies.ancestry.draft(entries, draft, receipt, newer);
		if (decision.kind === 'unchanged') return draft;
		if (decision.kind === 'adopt') return decision.draft;
		if (
			decision.observed.type !== 'export_settings' ||
			decision.onto.type !== 'export_settings' ||
			draft.local?.type !== 'export_settings'
		)
			throw new Error('Export settings ancestry has the wrong resource type');
		const replay = this.dependencies.fields.replay(
			'export_settings',
			decision.observed.value,
			draft.local.value,
			decision.onto.value
		);
		return {
			...draft,
			base: decision.base,
			basedOn: decision.basedOn,
			local: { type: 'export_settings', value: replay.value }
		};
	}
	close(): void {
		this.state.clear();
	}

	private capture(generation: number): DeliverableOperation {
		const binding = this.dependencies.session.resourceBinding;
		if (!binding) throw new Error('The workspace is not open.');
		const operation = {
			binding,
			account: this.dependencies.accounts.get(binding.resourceKey),
			generation
		};
		this.requireCurrent(operation);
		return operation;
	}
	private current(operation: DeliverableOperation): boolean {
		const binding = this.dependencies.session.resourceBinding;
		return (
			operation.generation === this.state.generation &&
			binding !== null &&
			binding.accountId === operation.binding.accountId &&
			binding.resourceKey === operation.binding.resourceKey &&
			binding.generation === operation.binding.generation &&
			this.dependencies.environment.accountId === binding.accountId &&
			operation.account.accountId === binding.accountId &&
			!operation.account.cacheState.read().stopped
		);
	}
	private requireCurrent(operation: DeliverableOperation): void {
		if (!this.current(operation))
			throw new Error('The workspace or view changed. Close this view and try again.');
	}
	private async synchronize(operation: DeliverableOperation): Promise<void> {
		this.requireCurrent(operation);
		const { cacheState } = operation.account;
		const previous = cacheState.read().checking;
		if (previous) {
			await previous;
			this.requireCurrent(operation);
		}
		// A pass started before the mutation cannot establish its result. Join only a subsequent pass.
		let checking = cacheState.read().checking;
		if (!checking || checking === previous) {
			checking = this.pull(operation).finally(() => {
				if (cacheState.read().checking === checking) cacheState.update({ checking: null });
			});
			cacheState.update({ checking });
		}
		const result = await checking;
		this.requireCurrent(operation);
		if (result.kind !== 'complete')
			throw new Error(
				result.kind === 'failure' ? result.message : `Workspace synchronization is ${result.kind}.`
			);
	}
	private async pull(operation: DeliverableOperation): Promise<SynchronizationResult> {
		try {
			if (!this.dependencies.environment.online) return { kind: 'offline' };
			const { account, binding } = operation;
			let stored = await account.cacheStorage.load(binding.accountId);
			this.requireCurrent(operation);
			let more: boolean;
			do {
				this.requireCurrent(operation);
				if (!this.dependencies.environment.online) return { kind: 'offline' };
				const before = stored.cursor ?? initialSyncCursor;
				const page = await account.readTransport.pull(before);
				this.requireCurrent(operation);
				if (
					BigInt(page.cursor) < BigInt(before) ||
					(page.hasMore && BigInt(page.cursor) === BigInt(before))
				)
					throw new Error('The server page did not advance its checkpoint');
				await this.commitPage(operation, page);
				stored = await account.cacheStorage.load(binding.accountId);
				this.requireCurrent(operation);
				more = page.hasMore;
			} while (more);
			return { kind: 'complete' };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Workspace synchronization failed'
			};
		}
	}
	private async commitPage(
		operation: DeliverableOperation,
		page: SyncPage<WorkspaceRecord>
	): Promise<void> {
		const put: CachedRecord<WorkspaceRecord>[] = page.records.map(({ key, resource }) => ({
			key,
			entry: resource.kind === 'found' ? { kind: 'present', snapshot: resource.snapshot } : resource
		}));
		await operation.account.cacheStorage.transaction(operation.binding.accountId, async (tx) => {
			this.requireCurrent(operation);
			const previous = await tx.resources(put.map((row) => row.key));
			const checkpoint = await tx.checkpoint();
			this.requireCurrent(operation);
			const decision = this.dependencies.cacheMerge.decide(previous, checkpoint, {
				put,
				remove: [],
				cursor: page.cursor,
				inventoryComplete: !page.hasMore
			});
			await tx.put(decision.put);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
			this.requireCurrent(operation);
		});
	}

	private async readLocal(operation: DeliverableOperation, key: string) {
		let local = await operation.account.repository.read(operation.binding.accountId);
		this.requireCurrent(operation);
		let records = this.dependencies.projection.project(
			new Map(local.cache.records.map((row) => [row.key, row.entry])),
			local.writes.entries
		);
		if (
			!records.has(key) &&
			!local.cache.inventoryComplete &&
			!local.cache.records.some((row) => row.key === key && row.entry.kind === 'deleted')
		) {
			await this.synchronize(operation);
			local = await operation.account.repository.read(operation.binding.accountId);
			this.requireCurrent(operation);
			records = this.dependencies.projection.project(
				new Map(local.cache.records.map((row) => [row.key, row.entry])),
				local.writes.entries
			);
			if (!records.has(key) && !local.cache.inventoryComplete)
				throw new Error('Required workspace data is unavailable. Reconnect and retry.');
		}
		return { local, records };
	}
}
