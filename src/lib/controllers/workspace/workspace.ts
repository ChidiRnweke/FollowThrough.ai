import type { WorkspaceReadinessRules } from '$lib/services/workspace/startup';
import type {
	SyncResourceRules,
	IOutboxDeliveryService,
	IOutboxEditingService
} from '$lib/services/sync/state';
import type { ISyncSchedulingService } from '$lib/services/sync/scheduling';
import type { FieldReplay } from '$lib/services/sync/rebase';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type { ExportSettingsRules } from '$lib/services/deliverables/settings';
import type { NoteCreationRules, NoteTrashRules } from '$lib/services/notes/lifecycle';
import type { NoteEditingRules } from '$lib/services/notes/editing';
import type { IWidgetLifecycleService } from '$lib/services/widgets/trash';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';
import type { IWidgetEditingService } from '$lib/services/widgets/edits';
import type { TodoCreationRules, TodoEditingRules } from '$lib/services/todos/edits';
import type { ProjectDetailRules } from '$lib/services/projects/details';
import type { DiagramEditingRules } from '$lib/services/diagrams/editing';
import type { DiagramLifecycleRules } from '$lib/services/diagrams/trash';
import type { SkillMetadataEditing } from '$lib/services/skills/metadata';
import type { IMemoryEditingService } from '$lib/services/memory/edits';
import type { AgentPreferenceEditing } from '$lib/services/agent/preferences';
import type {
	WorkspaceStorage,
	OutboxTable,
	OutboxUnitOfWork
} from '$lib/client/services/workspace/storage';
import type { WorkspaceTransport } from '$lib/client/services/workspace/transport';
import type { WorkspaceStores } from '$lib/stores/workspace/stores';
import type { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import type { WorkspaceResourceStore } from '$lib/stores/workspace/resources.svelte';
import type {
	WorkspaceDraftStore,
	ResourceObservationStore
} from '$lib/stores/workspace/draft.svelte';
import type { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
import type { ResourceCacheStore } from '$lib/stores/sync/cache';
import type { MutationQueueStore } from '$lib/stores/sync/submission';
import type { SyncExecutionStore } from '$lib/stores/sync/execution';
import { OutboxAccountChangedError } from '$lib/errors';
import { widgetCatalog } from '$lib/models/widgets';
import type {
	Widget,
	WidgetCandidate,
	WidgetCandidateReader,
	WidgetCatalog,
	WidgetChange,
	WidgetCreation,
	WidgetDraft,
	WidgetEditResult
} from '$lib/models/widgets';
import type {
	MemoryEntry,
	MemoryEntryId,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import type {
	AgentModel,
	AgentPreferenceValues,
	UpdateAgentPreferencesInput
} from '$lib/models/agent';
import type {
	IAgentModelSelectionService,
	IAgentModelChoiceService
} from '$lib/services/agent/model-selection';
import type { Todo, UpdateTodoInput } from '$lib/models/todos';
import type { Project, ProjectId } from '$lib/models/projects';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId, NoteRevision } from '$lib/models/notes';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type {
	StagedWrite,
	WorkspaceEditContext,
	WorkspaceSave,
	WorkspaceChange,
	WorkspaceBatch
} from '$lib/models/workspace-editing';
import type { WorkspaceReadiness } from '$lib/models/workspace-startup';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { WorkspaceValues, WorkspaceRecord } from '$lib/models/workspace-records';
import type {
	PreparedWorkspaceCommand,
	WorkspaceCommand,
	WorkspaceCommandContext,
	WorkspaceCreation
} from '$lib/models/workspace-mutations';
import type { WorkspaceResourceType, WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import {
	initialSyncCursor,
	type CacheAccess,
	type ResourceState,
	type ResourceDeletion,
	type SubmissionResult,
	type SyncEtag,
	type SyncLane,
	type SyncSnapshot,
	type SynchronizationResult,
	type StoredCache,
	type TransferState
} from '$lib/models/sync';
import type {
	DraftStatus,
	OutboxEntry,
	OutboxProjection,
	WriteBase,
	WriteBaseResolution,
	WriteConflictView,
	WriteContent,
	WriteDraft,
	WriteOutcome,
	WriteReceipt,
	WriteRebase
} from '$lib/models/outbox';

type Entry = OutboxEntry<WorkspaceCommand, WorkspaceRecord>;
type Draft = WriteDraft<WorkspaceCommand, WorkspaceRecord>;
type Projection = WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>;

// ===== Public contracts =====

export interface WorkspaceEvents {
	refresh(): void;
	offline(): void;
	bootstrapChanged(removed: boolean): void;
}

/** Browser mechanics: clocks, timers, locks, events and the Svelte input boundary. */
export interface WorkspaceEnvironment {
	/** What a failed server request says to the person who made it. */
	explain(error: unknown, fallback: string): string;
	/** The account the server's readable cookie names; never authentication. */
	readonly accountId: string | null;
	readonly online: boolean;
	reload(): void;
	listen(events: WorkspaceEvents): () => void;
	now(): DateTime;
	operationId(): string;
	/** IndexedDB cannot clone a Svelte proxy; inputs are snapshotted once at this boundary. */
	snapshot<T>(value: T): T;
	observe(start: () => void): () => void;
	clock(): number;
	schedule(at: number, work: () => Promise<void>): () => void;
	/** Runs the work while this tab holds the account's writer lock, or reports another tab has it. */
	tryWriterLock<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }>;
	writerLock<T>(accountId: string, work: () => Promise<T>): Promise<T>;
}

/** The shared rules the workspace applies; each is a pure decision over models. */
export interface WorkspaceRules {
	readonly readiness: WorkspaceReadinessRules;
	readonly sync: SyncResourceRules;
	readonly outboxEditing: IOutboxEditingService;
	readonly outboxDelivery: IOutboxDeliveryService;
	readonly scheduling: ISyncSchedulingService;
	readonly fields: FieldReplay;
	readonly commands: WorkspaceCommandRules;
	readonly exportSettings: ExportSettingsRules;
	readonly diagramEditing: DiagramEditingRules;
	readonly diagramLifecycle: DiagramLifecycleRules;
	readonly skillMetadata: SkillMetadataEditing;
	readonly todoCreation: TodoCreationRules;
	readonly todoEditing: TodoEditingRules;
	readonly widgetPatches: IWidgetPatchService;
	readonly widgetCandidates: WidgetCandidateReader;
	readonly widgetEditing: IWidgetEditingService;
	readonly widgetLifecycle: IWidgetLifecycleService;
	readonly memoryEditing: IMemoryEditingService;
	readonly projectDetails: ProjectDetailRules;
	readonly noteCreation: NoteCreationRules;
	readonly noteTrash: NoteTrashRules;
	readonly noteEditing: NoteEditingRules;
	readonly agentPreferences: AgentPreferenceEditing;
	readonly modelSelection: IAgentModelSelectionService;
	readonly modelChoices: IAgentModelChoiceService;
}

export interface WorkspaceSession {
	readonly resources: WorkspaceResourcesController;
	readonly bootstrap: WorkspaceBootstrap;
	readonly startupError: string | null;
	/** The account's agent preferences; they fail until downloaded or proven absent. */
	readonly preferences: AgentPreferenceValues;
	readonly agentDefaults: WorkspaceBootstrap['agentDefaults'];
	readonly agentModels: readonly AgentModel[];
}

export type WorkspaceOpened<K extends WorkspaceResourceType> =
	| {
			readonly kind: 'ready';
			readonly draft: WorkspaceDraftController<K>;
			readonly value: WorkspaceValues[K];
	  }
	| { readonly kind: 'failure'; readonly message: string };

/** One resource as a read sees it: present, proven absent, or not readable now. */
export type WorkspaceRead<K extends WorkspaceResourceType> =
	| { readonly kind: 'ready'; readonly value: WorkspaceValues[K] }
	| { readonly kind: 'absent' }
	| { readonly kind: 'failure'; readonly message: string };

export type SessionSynchronization =
	| { readonly kind: 'complete' | 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };

/** The browser's workspace: the signed-in account and its local-first replica. */
export interface WorkspaceController {
	readonly current: WorkspaceSession | null;
	openPreferences<K extends 'agent_preferences' | 'user_preferences'>(
		type: K
	): Promise<{ draft: WorkspaceDraftController<K>; value: WorkspaceValues[K] }>;
	start(): Promise<WorkspaceSession>;
	synchronize(force?: boolean): Promise<SessionSynchronization>;
	/**
	 * Apply one command to a resource and store it durably on this device. The edit is sent when
	 * the account is online; a conflict waits for review in the resource's editors.
	 */
	edit<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		command: PreparedWorkspaceCommand
	): Promise<WorkspaceChange<WorkspaceValues[K]>>;
	/** Create one resource on this device; it is sent when the account is online. */
	create(command: WorkspaceCreation): Promise<WorkspaceChange<WorkspaceRecord>>;
	/**
	 * Apply edits to several resources in order. Every base is captured before the first
	 * write, so a change made elsewhere meanwhile is reviewed rather than overwritten.
	 */
	editAll(
		edits: readonly {
			readonly identity: WorkspaceResourceIdentity;
			readonly command: PreparedWorkspaceCommand;
		}[]
	): Promise<WorkspaceBatch>;
	/**
	 * Read one resource of the signed-in account: the device copy with local edits applied,
	 * downloading it first when this device has never seen it.
	 */
	read<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		name: string
	): Promise<WorkspaceRead<K>>;
	/**
	 * Like `read`, but "absent" is proven by the account's complete inventory, so a setting
	 * the user never saved reads as absent rather than as not downloaded yet.
	 */
	find<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		name: string
	): Promise<WorkspaceRead<K>>;
	/**
	 * An editor of a per-account setting, created locally from `initial` when the account has
	 * none yet. A setting proven absent is a value the user simply has not changed.
	 */
	openOrCreate<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		initial: WorkspaceRecord
	): Promise<WorkspaceOpened<K>>;
	/**
	 * Wait for a change made directly on the server, such as a move or a permanent deletion,
	 * then refresh this device's copy so the result is on screen before the caller continues.
	 * A refusal carries the server's explanation.
	 */
	serverChange<T>(request: Promise<T>): Promise<WorkspaceChange<T>>;
	/**
	 * An editor of one resource of the open account whose base is the version on screen now, so
	 * a later change made elsewhere is reviewed instead of overwritten. Null before startup.
	 */
	capture<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): WorkspaceDraftController<K> | null;
	stop(): void;
	signOut(): void;
	downloadLocalWrites(): Promise<Blob>;
	resetLocalWorkspace(): Promise<void>;
}

/** One account's replica: what a surface may show now, and every local write. */
export interface WorkspaceResourcesController {
	readonly accountId: string;
	readonly active: boolean;
	readonly online: boolean;
	readonly downloadProgress: { completed: number; total: number; inventoryComplete: boolean };
	readonly failedDownloads: number;
	readonly startupReadiness: WorkspaceReadiness;
	readonly records: ReadonlyMap<string, WorkspaceRecord>;
	readonly pending: readonly Entry[];
	readonly availability: 'complete' | 'unknown';
	readonly readStatus: SynchronizationResult;
	readonly writeStatus: SubmissionResult;
	initialize(): Promise<void>;
	prepare(): Promise<void>;
	collectionReadiness(): 'unknown' | 'ready';
	requireCollections(): Promise<void>;
	access(identity: WorkspaceResourceIdentity): CacheAccess<WorkspaceRecord>;
	open(identity: WorkspaceResourceIdentity): Promise<CacheAccess<WorkspaceRecord>>;
	lookup(
		identity: WorkspaceResourceIdentity
	): Promise<CacheAccess<WorkspaceRecord> | { kind: 'absent' }>;
	state(identity: WorkspaceResourceIdentity): ResourceState<WorkspaceRecord> | undefined;
	snapshot(identity: WorkspaceResourceIdentity): SyncSnapshot<WorkspaceRecord> | null;
	view<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): ResourceViewController<K>;
	draft<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): WorkspaceDraftController<K>;
	reviewDependents(operationId: string): readonly Entry[];
	refreshConflict(operationId: string): Promise<void>;
	keepLocal(operationId: string): Promise<string>;
	discard(operationIds: readonly string[]): Promise<void>;
	create(command: WorkspaceCreation): Promise<WorkspaceRecord>;
	setOnline(online: boolean): void;
	synchronize(force?: boolean): Promise<void>;
	stop(): void;
}
export interface ResourceViewController<K extends WorkspaceResourceType> {
	readonly identity: WorkspaceResourceIdentity & { type: K };
	readonly state: CacheAccess<WorkspaceValues[K]>;
	retry(): Promise<CacheAccess<WorkspaceRecord>>;
}
export interface WorkspaceDraftController<K extends WorkspaceResourceType> {
	readonly identity: WorkspaceResourceIdentity & { type: K };
	readonly active: boolean;
	readonly state: CacheAccess<WorkspaceValues[K]>;
	readonly newer: WorkspaceValues[K] | null;
	readonly value: WorkspaceValues[K] | null;
	readonly status: DraftStatus;
	readonly lastError: string | undefined;
	readonly conflict: WriteConflictView<WorkspaceValues[K]> | undefined;
	open(): Promise<CacheAccess<WorkspaceValues[K]>>;
	adopt(): WorkspaceValues[K];
	capture(): void;
	captureOrCreate(initial: WorkspaceRecord): void;
	read(): Promise<CacheAccess<WorkspaceValues[K]>>;
	read(isCurrent: () => boolean): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }>;
	readOrCreate(initial: WorkspaceRecord): Promise<CacheAccess<WorkspaceValues[K]>>;
	stage(command: PreparedWorkspaceCommand): Promise<WorkspaceSave<K>>;
	discardPublished(revision: NoteRevision): Promise<WorkspaceSave<K>>;
	retry(): Promise<void>;
	keep(): Promise<void>;
	discard(): Promise<CacheAccess<WorkspaceValues[K]>>;
	discard(
		isCurrent: () => boolean
	): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }>;
}

/**
 * One browser tab's workspace. It binds the signed-in account, replicates that account's records
 * into IndexedDB and queues every local write there before sending it. Late work cannot publish
 * into a replacement account: each account's replica is its own object with its own state.
 */
export class Workspace implements WorkspaceController {
	constructor(
		private readonly stores: WorkspaceStores,
		private readonly storage: WorkspaceStorage,
		private readonly transport: WorkspaceTransport,
		private readonly environment: WorkspaceEnvironment,
		private readonly rules: WorkspaceRules
	) {}
	private get state() {
		return this.stores.session;
	}
	get current(): WorkspaceSession | null {
		return this.state.current;
	}
	stop(): void {
		const session = this.state.current;
		const detach = this.state.detach;
		this.state.clear();
		session?.resources.stop();
		detach?.();
	}
	private stillBound(): boolean {
		return (
			this.state.current !== null &&
			this.environment.accountId === this.state.current.bootstrap.accountId
		);
	}
	async synchronize(force = false): Promise<SessionSynchronization> {
		const session = this.state.current;
		if (!session) return { kind: 'stopped' };
		if (!this.stillBound()) {
			this.stop();
			this.environment.reload();
			return { kind: 'stopped' };
		}
		session.resources.setOnline(this.environment.online);
		try {
			if (session.startupError && this.environment.online) await this.refreshBootstrap();
			await Promise.all([
				session.resources.open({ type: 'users', id: [session.bootstrap.accountId] }),
				session.resources.synchronize(force)
			]);
			if (this.state.current === session && !this.stillBound()) {
				this.stop();
				this.environment.reload();
				return { kind: 'stopped' };
			}
			return { kind: 'complete' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Workspace synchronization failed';
			this.state.fail(session, message);
			return { kind: 'failure', message };
		}
	}
	private async refreshBootstrap(): Promise<SessionSynchronization> {
		const session = this.state.current;
		if (!session || !this.environment.online) return { kind: 'complete' };
		try {
			const bootstrap = await this.transport.bootstrap();
			if (this.state.current !== session) return { kind: 'complete' };
			if (bootstrap.accountId !== session.bootstrap.accountId || !this.stillBound()) {
				this.stop();
				this.environment.reload();
				return { kind: 'complete' };
			}
			this.storage.saveBootstrap(bootstrap);
			this.state.refresh(session, bootstrap);
			return { kind: 'complete' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Deployment settings could not be refreshed';
			this.state.fail(session, message);
			return { kind: 'failure', message };
		}
	}
	private async begin(): Promise<WorkspaceSession> {
		const openingGeneration = this.state.generation;
		const stored = this.storage.readBootstrap(this.environment.accountId);
		if (stored.kind === 'corrupt' && !this.environment.online)
			throw new Error(
				'Saved startup settings could not be read. Reconnect to restore them; saved edits remain on this device.'
			);
		const bootstrap = stored.kind === 'stored' ? stored.value : await this.transport.bootstrap();
		if (
			this.state.generation !== openingGeneration ||
			this.environment.accountId !== bootstrap.accountId
		)
			throw new Error('The workspace account changed while opening');
		this.storage.saveBootstrap(bootstrap);
		const resources = this.account(bootstrap.accountId);
		resources.setOnline(this.environment.online);
		this.state.publish(this.session(resources, bootstrap));
		const session = this.state.current;
		if (!session) throw new Error('The workspace account changed while opening');
		await resources.initialize();
		// Publish before inventory completion so targeted reads cannot delay background replication.
		if (this.state.generation !== openingGeneration || this.state.current !== session)
			throw new Error('The workspace account changed while opening');
		void this.synchronize();
		this.state.attach(
			this.environment.listen({
				refresh: () => {
					void this.synchronize();
				},
				offline: () => resources.setOnline(false),
				bootstrapChanged: (removed) => {
					if (!this.stillBound() || removed) {
						this.stop();
						this.environment.reload();
					}
				}
			})
		);
		if (stored.kind === 'stored') void this.refreshBootstrap();
		return session;
	}
	private session(resources: AccountWorkspace, bootstrap: WorkspaceBootstrap): WorkspaceSession {
		const rules = this.rules;
		return {
			resources,
			bootstrap,
			startupError: null,
			get preferences() {
				return resources.preferences;
			},
			get agentDefaults() {
				return {
					chatModelId: rules.modelSelection.resolveDefaultAgentModel(
						this.preferences,
						this.bootstrap.agentDefaults.chatModelId
					),
					visionModelId: rules.modelSelection.resolveDefaultVisionModel(
						this.preferences,
						this.bootstrap.agentDefaults.visionModelId
					)
				};
			},
			get agentModels() {
				return rules.modelChoices.configuredAgentModels(
					this.bootstrap.agentModels,
					this.agentDefaults
				);
			}
		};
	}
	/** One account's replica, with its own state; nothing it does outlives its stop. */
	private account(accountId: string): AccountWorkspace {
		this.storage.open(accountId);
		const stores = this.stores.account();
		const execution: AccountExecution = new ReplicaExecution(
			this.environment,
			stores.execution,
			this.rules.scheduling,
			{
				pull: () => cache.refresh(),
				writes: () => writes.submit(),
				failed: () => writes.notify()
			}
		);
		const outbox = new ReplicaOutbox(accountId, this.storage, this.rules);
		const cache = new ReplicaCache(
			accountId,
			this.storage,
			this.transport,
			this.rules,
			stores.cache
		);
		const writes = new ReplicaSubmission(
			accountId,
			outbox,
			cache,
			this.transport,
			this.environment,
			stores.queue,
			execution,
			this.rules
		);
		return new AccountReplica(
			accountId,
			this.storage,
			this.rules,
			stores.resources,
			this.stores,
			this.environment,
			new ReplicaCommands(this.rules),
			cache,
			writes,
			execution
		);
	}

	async openPreferences<K extends 'agent_preferences' | 'user_preferences'>(
		type: K
	): Promise<{ draft: WorkspaceDraftController<K>; value: WorkspaceValues[K] }> {
		const session = await this.start();
		const draft = session.resources.draft({ type, id: [session.bootstrap.accountId] });
		const timestamp = this.environment.now();
		const common = {
			userId: session.bootstrap.accountId as UserId,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		const opened = await draft.readOrCreate(
			type === 'agent_preferences'
				? {
						type: 'agent_preferences',
						value: { ...common, executionMode: 'approval_required', inlineSuggestionsEnabled: true }
					}
				: { type: 'user_preferences', value: common }
		);
		if (opened.kind !== 'ready')
			throw new Error(draft.lastError ?? 'These preferences are unavailable');
		return { draft, value: opened.value };
	}

	read<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		name: string
	): Promise<WorkspaceRead<K>> {
		return this.reading<K>(identity, name, (resources, target) => resources.open(target));
	}
	find<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		name: string
	): Promise<WorkspaceRead<K>> {
		return this.reading<K>(identity, name, (resources, target) => resources.lookup(target));
	}
	private async reading<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		name: string,
		access: (
			resources: WorkspaceResourcesController,
			target: WorkspaceResourceIdentity
		) => Promise<CacheAccess<WorkspaceRecord> | { kind: 'absent' }>
	): Promise<WorkspaceRead<K>> {
		try {
			const session = await this.start();
			// Widening to the constraint: TypeScript cannot distribute `K` over the identity union.
			const found = await access(session.resources, identity as WorkspaceResourceIdentity);
			if (this.state.current !== session)
				return { kind: 'failure', message: 'The workspace account changed while reading.' };
			if (found.kind === 'absent' || found.kind === 'deleted') return { kind: 'absent' };
			if (found.kind !== 'ready')
				return { kind: 'failure', message: this.rules.sync.accessMessage(found, name) };
			if (!this.rules.commands.isWorkspaceRecord(found.value, identity.type))
				return { kind: 'failure', message: `The ${name} has the wrong resource type` };
			return { kind: 'ready', value: found.value.value };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : `The ${name} could not be read`
			};
		}
	}
	async editAll(
		edits: readonly {
			readonly identity: WorkspaceResourceIdentity;
			readonly command: PreparedWorkspaceCommand;
		}[]
	): Promise<WorkspaceBatch> {
		const session = this.state.current;
		if (!session) return { kind: 'failure', saved: 0, message: 'Open the workspace first' };
		const drafts = edits.map(({ identity, command }) => {
			const draft = session.resources.draft(identity);
			draft.capture();
			return { draft, command };
		});
		for (const [saved, { draft, command }] of drafts.entries()) {
			if (this.state.current !== session)
				return {
					kind: 'failure',
					saved,
					message: 'The workspace account changed during the edits'
				};
			const staged = await draft
				.stage(command)
				.catch((error): WorkspaceSave<WorkspaceResourceType> => ({
					kind: 'failure',
					message: error instanceof Error ? error.message : 'Device storage is unavailable'
				}));
			if (staged.kind === 'failure') return { kind: 'failure', saved, message: staged.message };
		}
		return { kind: 'complete', saved: drafts.length };
	}
	async openOrCreate<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		initial: WorkspaceRecord
	): Promise<WorkspaceOpened<K>> {
		try {
			const session = await this.start();
			const draft = session.resources.draft<K>(identity);
			const opened = await draft.readOrCreate(initial);
			if (this.state.current !== session)
				return { kind: 'failure', message: 'The workspace account changed while opening.' };
			if (opened.kind !== 'ready')
				return { kind: 'failure', message: draft.lastError ?? 'This setting is unavailable' };
			return { kind: 'ready', draft, value: opened.value };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'This setting could not be loaded'
			};
		}
	}
	async edit<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K },
		command: PreparedWorkspaceCommand
	): Promise<WorkspaceChange<WorkspaceValues[K]>> {
		try {
			const session = await this.start();
			// A restore lands in its parent folder, so the folder must be known on this device.
			if (command.kind === 'restoreNote') {
				const opened = await session.resources.open({ type: 'notes', id: [command.noteId] });
				const parentId =
					opened.kind === 'ready' && opened.value.type === 'notes'
						? opened.value.value.parentId
						: null;
				const parent = parentId
					? await session.resources.lookup({ type: 'notes', id: [parentId] })
					: null;
				if (parent && !['ready', 'absent', 'deleted'].includes(parent.kind))
					return { kind: 'failure', message: 'The parent folder is unavailable on this device' };
			}
			const draft = session.resources.draft<K>(identity);
			const opened = await draft.read();
			if (opened.kind !== 'ready')
				return { kind: 'failure', message: draft.lastError ?? 'The resource is unavailable' };
			const staged = await draft.stage(command);
			if (this.state.current !== session)
				return { kind: 'failure', message: 'The workspace account changed during the edit.' };
			if (staged.kind === 'failure') return staged;
			if (!staged.value)
				return { kind: 'failure', message: 'The edited resource no longer exists' };
			return { kind: 'saved', value: staged.value };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'The edit could not be saved'
			};
		}
	}
	async serverChange<T>(request: Promise<T>): Promise<WorkspaceChange<T>> {
		const accountId = this.environment.accountId;
		try {
			const value = await request;
			if (this.environment.accountId !== accountId)
				return { kind: 'failure', message: 'The workspace account changed during the action.' };
			await this.synchronize();
			return { kind: 'saved', value };
		} catch (error) {
			return {
				kind: 'failure',
				message: this.environment.explain(error, 'The action could not be saved')
			};
		}
	}
	capture<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): WorkspaceDraftController<K> | null {
		const session = this.state.current;
		if (!session) return null;
		const draft = session.resources.draft<K>(identity);
		draft.capture();
		return draft;
	}
	async create(command: WorkspaceCreation): Promise<WorkspaceChange<WorkspaceRecord>> {
		try {
			const session = await this.start();
			// A new entry takes its place among its project's entries, so read the project first.
			if (command.kind === 'createNote' || command.kind === 'createFolder') {
				await session.resources.open({ type: 'projects', id: [command.projectId] });
				await session.resources.prepare();
			}
			const record = await session.resources.create(command);
			if (this.state.current !== session)
				return { kind: 'failure', message: 'The workspace account changed during the edit.' };
			return { kind: 'saved', value: record };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'The item could not be saved'
			};
		}
	}

	start(): Promise<WorkspaceSession> {
		const starting = this.state.starting;
		if (starting) return starting;
		const pending = this.begin().catch((error) => {
			if (this.state.starting === pending) this.stop();
			throw error;
		});
		this.state.start(pending);
		return pending;
	}
	async downloadLocalWrites(): Promise<Blob> {
		const accountId = this.environment.accountId;
		if (!accountId)
			throw new Error('Sign in to identify the account whose saved edits you want to download');
		return this.storage.exportAccount(accountId);
	}
	async resetLocalWorkspace(): Promise<void> {
		const accountId = this.environment.accountId;
		if (!accountId) throw new Error('Sign in to identify the account to reset');
		this.stop();
		await this.storage.resetAccount(accountId);
	}
	signOut(): void {
		this.stop();
		this.storage.clearBootstrap();
	}
}

// ===== The parts of one account, as their collaborators see them =====

/** The account's downloaded copy of the server and its replication lane. */
interface AccountCache {
	readonly status: SynchronizationResult;
	readonly downloadProgress: { completed: number; total: number; inventoryComplete: boolean };
	readonly failedDownloads: number;
	readonly availability: 'unknown' | 'complete';
	subscribe(listener: () => void): () => void;
	setOnline(online: boolean): void;
	stop(): void;
	refresh(): Promise<SynchronizationResult>;
	open(key: string): Promise<CacheAccess<WorkspaceRecord>>;
	transfer(key: string): TransferState | undefined;
	applyStored(stored: StoredCache<WorkspaceRecord>, notify?: boolean): void;
	/** The complete server version of one resource, as conflict review needs it. */
	observe(
		key: string
	): Promise<Exclude<Awaited<ReturnType<WorkspaceTransport['read']>>, { kind: 'unchanged' }>>;
}

/** When the account's lanes run, and which writes wait for a retry deadline. */
interface AccountExecution {
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

/** Sends the account's queued writes and applies what the server decided. */
interface AccountSubmission {
	readonly status: SubmissionResult;
	reviewDependents(operationId: string): readonly Entry[];
	subscribe(listener: () => void): () => void;
	setOnline(online: boolean): void;
	stop(): void;
	applyStored(state: OutboxProjection<WorkspaceCommand, WorkspaceRecord>, notify?: boolean): void;
	append(draft: Draft): Promise<string>;
	refreshConflict(operationId: string): Promise<void>;
	keepLocal(operationId: string): Promise<string>;
	discard(operationIds: readonly string[]): Promise<void>;
	submit(): Promise<SubmissionResult>;
	notify(): void;
}

/** The account's durable queue; every decision runs inside one storage transaction. */
interface AccountOutbox {
	list(): Promise<readonly Entry[]>;
	snapshot(): Promise<OutboxProjection<WorkspaceCommand, WorkspaceRecord>>;
	append(draft: Draft): Promise<string>;
	resolveBase(operationId: string, resolution: WriteBaseResolution<WorkspaceRecord>): Promise<void>;
	keepLocal(operationId: string, replacementId: string): Promise<void>;
	discard(operationIds: readonly string[]): Promise<void>;
	take(excluded?: ReadonlySet<string>): Promise<Entry | null>;
	retry(operationId: string, message: string): Promise<void>;
	recover(): Promise<void>;
	settle(sent: Entry, outcome: WriteOutcome<WorkspaceRecord>): Promise<void>;
}

/** Turns a command and the version it edits into the write the outbox stores. */
interface AccountCommands {
	prepare(
		command: PreparedWorkspaceCommand,
		observed: WorkspaceRecord | null,
		workspace: WorkspaceCommandSource,
		now: DateTime
	): Promise<WriteContent<WorkspaceCommand, WorkspaceRecord>>;
}

// ===== One account =====

/** Internal coordination used by editor controllers, never returned to components. */
interface WorkspaceEditorCoordinator extends WorkspaceResourcesController {
	editBase(identity: WorkspaceResourceIdentity): WorkspaceEditContext;
	acknowledgedVersion(key: string, operationId: string): SyncEtag | null;
	uncertainWrite(key: string, operationId: string | null): boolean;
	prepareCommand(
		command: PreparedWorkspaceCommand,
		observed: WorkspaceRecord | null,
		now: DateTime
	): Promise<WriteContent<WorkspaceCommand, WorkspaceRecord>>;
	stage(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<StagedWrite>;
}

/** One account's workspace as the session that owns it sees it. */
interface AccountWorkspace extends WorkspaceResourcesController {
	/** The account's agent preferences; they fail until downloaded or proven absent. */
	readonly preferences: AgentPreferenceValues;
}

/** Features share resource identity, local overlays, and the same explicit-open read barrier. */
class AccountReplica implements AccountWorkspace, WorkspaceEditorCoordinator {
	private get revision() {
		return this.data.revision;
	}
	private get local() {
		return this.data.local;
	}
	private get stopped() {
		return this.data.stopped;
	}
	private get failure() {
		return this.data.failure;
	}
	private get cached() {
		return this.data.records;
	}
	private get projected() {
		return this.stores.projection.records;
	}
	get downloadProgress() {
		void this.revision;
		return this.cache.downloadProgress;
	}
	get failedDownloads(): number {
		void this.revision;
		return this.cache.failedDownloads;
	}
	get active(): boolean {
		return !this.stopped;
	}
	get online(): boolean {
		void this.revision;
		return this.execution.online;
	}
	constructor(
		readonly accountId: string,
		private readonly storage: WorkspaceStorage,
		private readonly rules: WorkspaceRules,
		private readonly data: WorkspaceResourceStore,
		private readonly stores: WorkspaceStores,
		private readonly environment: WorkspaceEnvironment,
		private readonly commands: AccountCommands,
		private readonly cache: AccountCache,
		private readonly writes: AccountSubmission,
		private readonly execution: AccountExecution
	) {}
	private observe(): void {
		this.data.addSubscriptions(
			this.cache.subscribe(() => this.data.invalidate()),
			this.writes.subscribe(() => this.data.invalidate()),
			this.storage.observe(
				this.accountId,
				(projection) => this.applyLocal(projection),
				(error) => this.observationFailed(error)
			)
		);
	}
	private applyLocal(
		projection: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>
	): void {
		if (this.stopped) return;
		const previous = this.local?.writes.entries ?? [];
		this.data.update({ local: projection });
		this.stores.projection.replace(
			this.rules.sync.visibleResources(this.cached, projection.writes.entries)
		);
		this.cache.applyStored(projection.cache, false);
		this.writes.applyStored(projection.writes, false);
		this.data.invalidate();
		// Only a newly queued identity wakes submissions. Cache changes and delivery updates do not loop.
		if (
			projection.writes.entries.some(
				(entry) =>
					entry.delivery.kind === 'queued' &&
					!previous.some((old) => old.intent.operationId === entry.intent.operationId)
			)
		)
			this.execution.changed();
	}
	private observationFailed(error: Error): void {
		if (!this.stopped) {
			this.data.update({ failure: { kind: 'failure', message: error.message } });
			this.stop();
		}
	}

	draft<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): WorkspaceDraftController<K> {
		return new WorkspaceDraft<K>(this.rules, this, identity, this.stores.draft(), this.environment);
	}

	get startupReadiness(): WorkspaceReadiness {
		const visible = (type: 'users' | 'agent_preferences', id: string) =>
			this.records.get(this.rules.commands.workspaceResourceKey({ type, id: [id] }));
		const state = this.state({ type: 'agent_preferences', id: [this.accountId] });
		const read = this.readStatus;
		return this.rules.readiness.workspaceReadiness({
			userKnown: visible('users', this.accountId) !== undefined,
			inboxKnown: [...this.records.values()].some(
				(record) =>
					record.type === 'projects' && record.value.role === 'inbox' && !record.value.archivedAt
			),
			preferencesKnown:
				visible('agent_preferences', this.accountId) !== undefined ||
				state?.kind === 'deleted' ||
				this.availability === 'complete',
			inventoryComplete: this.availability === 'complete',
			online: this.online,
			failure: read.kind === 'failure' ? read.message : null
		});
	}

	get records(): ReadonlyMap<string, WorkspaceRecord> {
		return this.projected;
	}
	/** Defaults apply only once the journal proves the account has no stored preferences. */
	get preferences(): AgentPreferenceValues {
		const identity = { type: 'agent_preferences' as const, id: [this.accountId] as [string] };
		const record = this.records.get(this.rules.commands.workspaceResourceKey(identity));
		if (record?.type === 'agent_preferences') return record.value;
		const state = this.state(identity);
		if ((state && state.kind !== 'deleted') || this.availability === 'unknown')
			throw new Error('Agent preferences have not been downloaded to this device');
		return {
			userId: this.accountId as UserId,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: true
		};
	}
	reviewDependents(operationId: string): readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[] {
		return this.writes.reviewDependents(operationId);
	}

	get pending() {
		void this.revision;
		return this.local?.writes.entries ?? [];
	}
	get availability() {
		void this.revision;
		return this.active && this.local?.cache.inventoryComplete ? 'complete' : 'unknown';
	}
	get readStatus() {
		void this.revision;
		return (
			this.failure ??
			(this.execution.failure
				? { kind: 'failure' as const, message: this.execution.failure }
				: this.cache.status)
		);
	}
	get writeStatus() {
		void this.revision;
		return this.writes.status;
	}
	private async readLocal(): Promise<void> {
		this.applyLocal(await this.storage.read(this.accountId));
	}
	initialize(): Promise<void> {
		if (this.stopped) return Promise.reject(new Error('This workspace account has stopped'));
		if (!this.data.initializing) {
			this.observe();
			this.data.setInitializing(
				this.readLocal().catch((error) => {
					this.data.setInitializing(null);
					for (const unsubscribe of this.data.takeSubscriptions()) unsubscribe();
					throw error;
				})
			);
		}
		return this.data.initializing!;
	}

	/** Render cached collections immediately while the runtime refreshes their inventory. */
	async prepare(): Promise<void> {
		await this.initialize();
		this.execution.committed();
	}
	collectionReadiness(): 'unknown' | 'ready' {
		void this.revision;
		return this.active && this.local?.cache.inventoryComplete ? 'ready' : 'unknown';
	}

	async requireCollections(): Promise<void> {
		await this.initialize();
		if (this.cache.availability === 'unknown') {
			const result = await this.cache.refresh();
			if (result.kind === 'failure') throw new Error(result.message);
		}
		await this.readLocal();
		if (this.collectionReadiness() !== 'ready')
			throw new Error(
				'Required workspace data is not available on this device. Reconnect and retry.'
			);
	}
	/** What a surface may show now. Cached and locally edited records never wait. */
	access(identity: WorkspaceResourceIdentity): CacheAccess<WorkspaceRecord> {
		void this.revision;
		if (this.failure) return this.failure;
		if (this.stopped) return { kind: 'unavailable' };
		const key = this.rules.commands.workspaceResourceKey(identity);
		return (
			this.rules.sync.localResource(this.pending, key) ??
			this.rules.sync.accessCache(this.cached.get(key), this.online, this.cache.transfer(key))
		);
	}
	view<K extends WorkspaceResourceType>(
		identity: WorkspaceResourceIdentity & { type: K }
	): ResourceViewController<K> {
		return new ResourceView<K>(
			this.rules,
			this,
			identity,
			this.stores.observation(),
			this.environment
		);
	}
	/** Downloads an uncached record. Storage is re-read only when this tab stored something. */
	async open(identity: WorkspaceResourceIdentity): Promise<CacheAccess<WorkspaceRecord>> {
		await this.initialize();
		const known = this.access(identity);
		if (known.kind === 'ready' || known.kind === 'deleted') return known;
		const result = await this.cache.open(this.rules.commands.workspaceResourceKey(identity));
		if (result.kind !== 'ready' && result.kind !== 'deleted') return result;
		await this.readLocal();
		return this.access(identity);
	}
	/** Optional records may use defaults only after the journal proves their absence. */
	async lookup(
		identity: WorkspaceResourceIdentity
	): Promise<CacheAccess<WorkspaceRecord> | { kind: 'absent' }> {
		await this.initialize();
		if (this.stopped) return { kind: 'unavailable' };
		const key = this.rules.commands.workspaceResourceKey(identity);
		if (this.rules.sync.localResource(this.pending, key)) return this.open(identity);
		if (this.cache.availability === 'unknown') {
			const result = await this.cache.refresh();
			if (result.kind === 'failure') return result;
			if (this.cache.availability === 'unknown') return { kind: 'unavailable' };
		}
		if (this.stopped) return { kind: 'unavailable' };
		const access = this.access(identity);
		return access.kind === 'ready' || access.kind === 'deleted' ? access : { kind: 'absent' };
	}

	/** Capture the version the editor actually sees, before its first change. */
	editBase(identity: WorkspaceResourceIdentity): {
		base: WriteBase<WorkspaceRecord> | null;
		basedOn: string | null;
		local: WorkspaceRecord;
	} {
		void this.revision;
		const key = this.rules.commands.workspaceResourceKey(identity);
		const pending = this.pending.findLast((entry) => entry.intent.key === key);
		if (pending) {
			if (!pending.intent.local) throw new Error('A locally deleted resource cannot be edited');
			return {
				base: pending.intent.base,
				basedOn: pending.intent.operationId,
				local: pending.intent.local
			};
		}
		const snapshot = this.snapshot(identity);
		if (!snapshot) throw new Error('Open the resource before editing it');
		return { base: snapshot, basedOn: null, local: snapshot.value };
	}
	state(identity: WorkspaceResourceIdentity) {
		void this.revision;
		return this.cached.get(this.rules.commands.workspaceResourceKey(identity));
	}

	snapshot(identity: WorkspaceResourceIdentity): SyncSnapshot<WorkspaceRecord> | null {
		void this.revision;
		const entry = this.cached.get(this.rules.commands.workspaceResourceKey(identity));
		return entry?.kind === 'present' ? this.rules.sync.cachedSnapshot(entry) : null;
	}
	refreshConflict(operationId: string): Promise<void> {
		return this.writes.refreshConflict(operationId).then(() => this.readLocal());
	}
	async keepLocal(operationId: string): Promise<string> {
		const replacement = await this.writes.keepLocal(operationId);
		await this.readLocal();
		return replacement;
	}
	/** The version the server recorded for this tab's write, once its receipt is stored. */
	acknowledgedVersion(key: string, operationId: string): SyncEtag | null {
		void this.revision;
		const receipt = this.local?.writes.receipts.get(key);
		if (receipt?.operationId !== operationId) return null;
		return receipt.resource.kind === 'found'
			? receipt.resource.snapshot.etag
			: receipt.resource.etag;
	}
	uncertainWrite(key: string, operationId: string | null): boolean {
		void this.revision;
		return (
			operationId !== null &&
			!this.pending.some((entry) => entry.intent.operationId === operationId) &&
			this.local?.writes.receipts.get(key)?.operationId !== operationId
		);
	}
	async discard(operationIds: readonly string[]): Promise<void> {
		await this.writes.discard(operationIds);
		await this.readLocal();
	}

	prepareCommand(
		command: PreparedWorkspaceCommand,
		observed: WorkspaceRecord | null,
		now: DateTime
	): Promise<WriteContent<WorkspaceCommand, WorkspaceRecord>> {
		return this.commands.prepare(command, observed, this, now);
	}

	async create(command: WorkspaceCreation): Promise<WorkspaceRecord> {
		const input = this.environment.snapshot(command);
		const now = this.environment.now();
		await this.initialize();
		const content = await this.prepareCommand(input, null, now);
		if (!content.local) throw new Error('Creation must produce a resource');
		await this.append({
			...content,
			operationId: this.environment.operationId(),
			key: this.rules.commands.workspaceResourceKey(this.rules.commands.mutationResource(input)),
			base: null,
			basedOn: null
		});
		return content.local;
	}

	private async append(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<string> {
		return (await this.stage(draft)).basedOn;
	}
	/**
	 * Queue a write and return what the next edit is based on, as the queue stored it. The queue
	 * may have stacked the write on a newer local edit and replayed its fields, so the caller's
	 * own copy is not the version it now edits.
	 */
	async stage(draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>): Promise<StagedWrite> {
		this.rules.commands.assertWorkspaceWriteIdentity(draft);
		// IndexedDB cannot clone a Svelte proxy; snapshot once at the shared UI boundary.
		await this.initialize();
		const operationId = await this.writes.append(this.environment.snapshot(draft));
		await this.readLocal();
		const staged = this.staged(draft, operationId);
		void this.synchronize();
		return staged;
	}
	private staged(
		draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>,
		operationId: string
	): StagedWrite {
		const entry = this.pending.find((pending) => pending.intent.operationId === operationId);
		if (entry) return { base: entry.intent.base, basedOn: operationId, local: entry.intent.local };
		const receipt = this.local?.writes.receipts.get(draft.key);
		if (receipt?.operationId === operationId)
			return receipt.resource.kind === 'found'
				? {
						base: receipt.resource.snapshot,
						basedOn: operationId,
						local: receipt.resource.snapshot.value
					}
				: { base: null, basedOn: operationId, local: null };
		// Settled without a stored receipt: `uncertainWrite` reports it, and the caller keeps its copy.
		return { base: draft.base, basedOn: operationId, local: draft.local };
	}
	setOnline(online: boolean): void {
		this.cache.setOnline(online);
		this.writes.setOnline(online);
	}
	synchronize(force = false): Promise<void> {
		return this.execution.synchronize(force);
	}

	stop(): void {
		this.data.update({ stopped: true, local: null });
		this.data.setInitializing(null);
		this.stores.projection.replace(new Map());
		this.data.invalidate();
		this.execution.stop();
		this.cache.stop();
		this.writes.stop();
		for (const unsubscribe of this.data.takeSubscriptions()) unsubscribe();
		this.storage.close(this.accountId);
	}
}

const valueOf = <K extends WorkspaceResourceType>(
	rules: WorkspaceCommandRules,
	record: WorkspaceRecord,
	type: K
): WorkspaceValues[K] => {
	if (!rules.isWorkspaceRecord(record, type))
		throw new Error('The surface received another resource type');
	return record.value;
};

/** A rendered surface's handle on one record. Observing a missing record starts its download. */
class ResourceView<K extends WorkspaceResourceType> implements ResourceViewController<K> {
	private readonly observe: () => void;
	private get failure() {
		return this.data.failure;
	}
	constructor(
		private readonly rules: WorkspaceRules,
		private readonly resources: WorkspaceResourcesController,
		readonly identity: WorkspaceResourceIdentity & { type: K },
		private readonly data: ResourceObservationStore,
		private readonly environment: WorkspaceEnvironment
	) {
		this.observe = this.environment.observe(() => {
			void this.retry();
		});
	}
	get state(): CacheAccess<WorkspaceValues[K]> {
		this.observe();
		const access = this.resources.access(this.identity);
		if (access.kind === 'ready')
			return {
				kind: 'ready',
				value: valueOf(this.rules.commands, access.value, this.identity.type)
			};
		return this.failure ?? access;
	}
	async retry(): Promise<CacheAccess<WorkspaceRecord>> {
		this.data.setFailure(null);
		try {
			return await this.resources.open(this.identity);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Device storage is unavailable';
			if (this.resources.active) this.data.setFailure({ kind: 'failure', message });
			return { kind: 'failure', message };
		}
	}
}

type DraftCommand = PreparedWorkspaceCommand | { kind: 'discardPublished'; revision: NoteRevision };

/** An editor's observed base, not another resource cache. All persistence and delivery use its workspace. */
class WorkspaceDraft<K extends WorkspaceResourceType> implements WorkspaceDraftController<K> {
	private get current() {
		return this.data.read().current;
	}
	private set current(value: WorkspaceEditContext | null) {
		this.data.update({ current: value });
	}
	private get savingLocal() {
		return this.data.read().savingLocal;
	}
	private set savingLocal(value: number) {
		this.data.update({ savingLocal: value });
	}
	private get error() {
		return this.data.read().error;
	}
	private set error(value: string | null) {
		this.data.update({ error: value });
	}
	private get staging() {
		return this.data.staging;
	}
	private set staging(value: Promise<void>) {
		this.data.setStaging(value);
	}
	private readonly key: string;
	constructor(
		private readonly rules: WorkspaceRules,
		private readonly resources: WorkspaceEditorCoordinator,
		readonly identity: WorkspaceResourceIdentity & { type: K },
		private readonly data: WorkspaceDraftStore,
		private readonly environment: WorkspaceEnvironment
	) {
		this.key = this.rules.commands.workspaceResourceKey(identity);
	}
	get active(): boolean {
		return this.resources.active;
	}

	private get entries() {
		return this.resources.pending.filter((entry) => entry.intent.key === this.key);
	}
	private valueOf(record: WorkspaceRecord): WorkspaceValues[K] {
		return valueOf(this.rules.commands, record, this.identity.type);
	}
	/** Ready once the editor has a captured base; until then, what the workspace knows. */
	get state(): CacheAccess<WorkspaceValues[K]> {
		const value = this.value;
		if (this.current && value) return { kind: 'ready', value };
		const access = this.resources.access(this.identity);
		if (access.kind !== 'ready') return access;
		return this.error ? { kind: 'failure', message: this.error } : { kind: 'wait' };
	}
	/** Capture the base an editor renders: at once when cached, after its download otherwise. */
	open(): Promise<CacheAccess<WorkspaceValues[K]>> {
		if (this.resources.access(this.identity).kind !== 'ready') return this.read();
		this.error = null;
		return Promise.resolve({ kind: 'ready', value: this.adopt() });
	}
	/** A cached server version this editor has not seen, when adopting it cannot lose a local write. */
	get newer(): WorkspaceValues[K] | null {
		const current = this.current;
		const snapshot = this.resources.snapshot(this.identity);
		if (!current || !snapshot || this.entries.length) return null;
		const observed =
			current.basedOn === null
				? (current.base?.etag ?? null)
				: this.resources.acknowledgedVersion(this.key, current.basedOn);
		return observed !== null && this.rules.sync.compareSyncEtags(snapshot.etag, observed) > 0
			? this.valueOf(snapshot.value)
			: null;
	}
	/** Move the observed base to what the workspace holds now. Performs no read. */
	adopt(): WorkspaceValues[K] {
		this.current = this.resources.editBase(this.identity);
		return this.valueOf(this.current.local);
	}
	get value(): WorkspaceValues[K] | null {
		if (!this.resources.active) return null;
		const creation = this.current?.base === null && this.current.basedOn === null;
		if (
			!creation &&
			!this.entries.length &&
			this.resources.state(this.identity)?.kind === 'deleted'
		)
			return null;
		const last = this.entries.at(-1);
		const record = last ? last.intent.local : this.current?.local;
		return record ? this.valueOf(record) : null;
	}
	get status(): DraftStatus {
		if (this.error || this.resources.uncertainWrite(this.key, this.current?.basedOn ?? null))
			return 'error';
		if (!this.current) return 'loading';
		if (this.savingLocal) return 'saving';
		if (this.entries.some((entry) => entry.delivery.kind === 'conflict')) return 'conflict';
		if (
			this.entries.some(
				(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
			)
		)
			return 'error';
		if (this.entries.some((entry) => entry.delivery.kind === 'sending')) return 'saving';
		return this.entries.length ? 'pending' : 'synced';
	}
	get lastError(): string | undefined {
		if (this.resources.uncertainWrite(this.key, this.current?.basedOn ?? null))
			return 'This item changed elsewhere. Save your edits to review the versions.';
		if (this.error) return this.error;
		const failed = this.entries.find(
			(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
		);
		return failed && (failed.delivery.kind === 'rejected' || failed.delivery.kind === 'retry')
			? failed.delivery.message
			: undefined;
	}
	get conflict(): WriteConflictView<WorkspaceValues[K]> | undefined {
		const entry = this.entries.find((entry) => entry.delivery.kind === 'conflict');
		if (!entry || entry.delivery.kind !== 'conflict') return undefined;
		const remote = entry.delivery.remote;
		return {
			base: entry.intent.base ? this.valueOf(entry.intent.base.value) : null,
			local: this.value,
			remote:
				remote.kind === 'found'
					? { kind: 'found', value: this.valueOf(remote.snapshot.value) }
					: remote
		};
	}
	/** Capture the base of a form that is already rendered; this performs no resource read. */
	capture(): void {
		this.current = this.resources.editBase(this.identity);
	}

	/** Capture a rendered optional value without awaiting a newer, unseen server version. */
	captureOrCreate(initial: WorkspaceRecord): void {
		if (
			this.rules.commands.workspaceResourceKey(
				this.rules.commands.workspaceRecordIdentity(initial)
			) !== this.key
		)
			throw new Error('The initial value belongs to a different resource');
		const state = this.resources.state(this.identity);
		const pending = this.resources.pending.some((entry) => entry.intent.key === this.key);
		if (pending || (state && state.kind !== 'deleted')) this.capture();
		else if (state?.kind === 'deleted' || this.resources.availability !== 'unknown')
			this.current = { base: null, basedOn: null, local: initial };
		else throw new Error('This resource is not available on this device');
	}

	read(): Promise<CacheAccess<WorkspaceValues[K]>>;
	read(isCurrent: () => boolean): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }>;
	async read(
		isCurrent: () => boolean = () => true
	): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }> {
		this.error = null;
		try {
			const opened = await this.resources.open(this.identity);
			if (!isCurrent() || !this.resources.active) return { kind: 'superseded' };
			if (opened.kind !== 'ready') {
				this.error = this.rules.sync.accessMessage(opened, 'item');
				return opened;
			}
			return { kind: 'ready', value: this.adopt() };
		} catch (error) {
			if (!isCurrent() || !this.resources.active) return { kind: 'superseded' };
			this.error = error instanceof Error ? error.message : 'Device storage is unavailable';
			return { kind: 'failure', message: this.error };
		}
	}
	/** An optional form may start a new resource only after absence is established. */
	async readOrCreate(initial: WorkspaceRecord): Promise<CacheAccess<WorkspaceValues[K]>> {
		this.error = null;
		try {
			if (
				this.rules.commands.workspaceResourceKey(
					this.rules.commands.workspaceRecordIdentity(initial)
				) !== this.key
			)
				throw new Error('The initial value belongs to a different resource');
			const opened = await this.resources.lookup(this.identity);
			if (!this.resources.active) return { kind: 'unavailable' };
			if (opened.kind === 'ready') {
				this.current = this.resources.editBase(this.identity);
			} else if (opened.kind === 'absent' || opened.kind === 'deleted') {
				this.current = { base: null, basedOn: null, local: initial };
			} else {
				this.error = this.rules.sync.accessMessage(opened, 'item');
				return opened;
			}
			return { kind: 'ready', value: this.valueOf(this.current.local) };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Device storage is unavailable';
			return { kind: 'failure', message: this.error };
		}
	}

	stage(
		command: PreparedWorkspaceCommand
	): Promise<
		{ kind: 'saved'; value: WorkspaceValues[K] | null } | { kind: 'failure'; message: string }
	> {
		return this.enqueue(command);
	}
	discardPublished(
		revision: NoteRevision
	): Promise<
		{ kind: 'saved'; value: WorkspaceValues[K] | null } | { kind: 'failure'; message: string }
	> {
		return this.enqueue({ kind: 'discardPublished', revision });
	}
	private enqueue(
		command: DraftCommand
	): Promise<
		{ kind: 'saved'; value: WorkspaceValues[K] | null } | { kind: 'failure'; message: string }
	> {
		const input = this.environment.snapshot(command);
		const now = this.environment.now();
		this.savingLocal++;
		const operation = this.staging
			.then(() => this.save(input, now))
			.finally(() => {
				this.savingLocal--;
			});
		this.staging = operation.then(() => undefined);
		return operation;
	}
	private async save(
		command: DraftCommand,
		now: DateTime
	): Promise<
		{ kind: 'saved'; value: WorkspaceValues[K] | null } | { kind: 'failure'; message: string }
	> {
		this.error = null;
		try {
			if (!this.active) return { kind: 'failure', message: 'This workspace account has stopped' };
			const context = this.current;
			if (!context) throw new Error('Open the resource before editing');
			const content =
				command.kind === 'discardPublished'
					? this.publishedContent(command.revision, context.local)
					: await this.resources.prepareCommand(command, context.local, now);
			if (
				this.rules.commands.workspaceResourceKey(
					this.rules.commands.mutationResource(content.command)
				) !== this.key
			)
				throw new Error('The edit belongs to a different resource');
			if (content.local) this.valueOf(content.local);
			const staged = await this.resources.stage({
				...content,
				operationId: this.environment.operationId(),
				key: this.key,
				base: context.base,
				basedOn: context.basedOn
			});
			if (!this.active) return { kind: 'failure', message: 'This workspace account has stopped' };
			this.current = { ...staged, local: staged.local ?? context.local };
			return { kind: 'saved', value: this.value };
		} catch (error) {
			if (!this.active) return { kind: 'failure', message: 'This workspace account has stopped' };
			this.error = error instanceof Error ? error.message : 'The local edit could not be saved';
			return { kind: 'failure', message: this.error };
		}
	}
	private publishedContent(revision: NoteRevision, record: WorkspaceRecord) {
		if (
			record.type !== 'notes' ||
			record.value.id !== revision.noteId ||
			record.value.publishedRevision !== revision.revision
		)
			throw new Error('Load the observed published version before discarding changes');
		return {
			command: { kind: 'discardNoteDraft' as const, noteId: revision.noteId },
			local: {
				type: 'notes' as const,
				value: {
					...record.value,
					document: revision.document,
					plainText: revision.plainText,
					title: revision.title,
					currentRevision: record.value.currentRevision + 1
				}
			},
			coalesce: null,
			references: []
		};
	}

	async retry(): Promise<void> {
		this.error = null;
		if (!this.current) await this.read();
		await this.resources.synchronize(true);
	}
	async keep(): Promise<void> {
		const conflict = this.entries.find((entry) => entry.delivery.kind === 'conflict');
		if (!conflict) throw new Error('This resource has no unresolved conflict');
		const replacementId = await this.resources.keepLocal(conflict.intent.operationId);
		if (
			this.current?.basedOn === conflict.intent.operationId &&
			conflict.delivery.kind === 'conflict' &&
			conflict.delivery.remote.kind === 'found'
		) {
			this.current = {
				...this.current,
				basedOn: replacementId,
				base: conflict.delivery.remote.snapshot
			};
		}
		await this.resources.synchronize();
	}
	discard(): Promise<CacheAccess<WorkspaceValues[K]>>;
	discard(
		isCurrent: () => boolean
	): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }>;
	async discard(
		isCurrent: () => boolean = () => true
	): Promise<CacheAccess<WorkspaceValues[K]> | { kind: 'superseded' }> {
		const reviewed = this.entries;
		const conflict = reviewed.find((entry) => entry.delivery.kind === 'conflict');
		const state = this.resources.state(this.identity);
		const snapshot = this.resources.snapshot(this.identity);
		if (state?.kind !== 'deleted') {
			if (!snapshot) throw new Error('Download the server copy before discarding the local edit');
			if (conflict?.delivery.kind === 'conflict' && conflict.delivery.remote.kind === 'found') {
				const observed = conflict.delivery.remote.snapshot;
				if (
					observed.etag !== null
						? this.rules.sync.compareSyncEtags(snapshot.etag, observed.etag) < 0
						: !this.resources.online || this.resources.readStatus.kind !== 'complete'
				)
					throw new Error('Reconnect to validate the server copy before discarding the local edit');
			}
		}
		await this.resources.discard(reviewed.map((entry) => entry.intent.operationId));
		if (!isCurrent()) return { kind: 'superseded' };
		if (state?.kind === 'deleted') {
			this.current = null;
			return { kind: 'deleted' };
		}
		return this.read(isCurrent);
	}
}

// ===== Replication =====

/** Replication of one account's resources: page pulls, targeted downloads and accepted writes. */
class ReplicaCache implements AccountCache {
	constructor(
		readonly accountId: string,
		private readonly storage: WorkspaceStorage,
		private readonly transport: WorkspaceTransport,
		private readonly rules: WorkspaceRules,
		private readonly state: ResourceCacheStore<WorkspaceRecord>
	) {}

	subscribe(listener: () => void): () => void {
		return this.state.subscribe(listener);
	}
	get status(): SynchronizationResult {
		return this.state.read().result;
	}
	get downloadProgress(): { completed: number; total: number; inventoryComplete: boolean } {
		const present = [...this.state.read().entries.values()].filter(
			(entry) => entry.kind !== 'deleted'
		);
		return {
			completed: present.filter(this.rules.sync.resourceCurrent).length,
			total: present.length,
			inventoryComplete: this.state.read().inventoryComplete
		};
	}
	get failedDownloads(): number {
		return [...this.state.attempts().values()].filter(
			(attempt) => attempt.transfer.kind === 'failed'
		).length;
	}
	get availability(): 'unknown' | 'complete' {
		return this.state.read().cursor !== null &&
			this.state.read().inventoryComplete &&
			!this.state.read().stopped
			? 'complete'
			: 'unknown';
	}
	access(key: string): CacheAccess<WorkspaceRecord> {
		if (this.state.read().stopped) return { kind: 'unavailable' };
		return this.rules.sync.accessCache(
			this.entry(key),
			this.state.read().online,
			this.transfer(key)
		);
	}
	setOnline(online: boolean): void {
		this.state.update({ online });
		this.notify();
	}
	stop(): void {
		this.state.update({ stopped: true });
		this.state.clearAttempts();
		this.state.update({ entries: new Map() });
		this.state.update({ result: { kind: 'stopped' } });
		this.notify();
	}
	initialize(): Promise<void> {
		const existing = this.state.read().initializing;
		if (existing) return existing;
		const initializing = this.restore().catch((error) => {
			this.state.update({ initializing: null });
			throw error;
		});
		this.state.update({ initializing });
		return initializing;
	}
	/** Incorporate another tab's durable records without replacing newer local knowledge. */
	async reload(): Promise<void> {
		await this.initialize();
		await this.restore();
	}
	refresh(): Promise<SynchronizationResult> {
		const existing = this.state.read().checking;
		if (existing) return existing;
		const checking = this.pullChanges().finally(() => {
			this.state.update({ checking: null });
		});
		this.state.update({ checking });
		return checking;
	}
	async open(key: string): Promise<CacheAccess<WorkspaceRecord>> {
		try {
			await this.initialize();
			const current = this.access(key);
			if (
				current.kind === 'ready' ||
				current.kind === 'deleted' ||
				!this.state.read().online ||
				this.state.read().stopped
			)
				return current;
			const result = await this.waitForRead(key);
			if (result.kind === 'failure' || result.kind === 'unavailable') return result;
			const after = this.access(key);
			return after.kind === 'wait' ? this.open(key) : after;
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Local storage failed'
			};
		}
	}
	transfer(key: string): TransferState | undefined {
		const attempt = this.state.attempts().get(key);
		return !this.rules.sync.resourceCurrent(this.entry(key)) &&
			this.entry(key)?.kind !== 'deleted' &&
			attempt?.target === this.rules.sync.resourceVersion(this.entry(key))
			? attempt?.transfer
			: undefined;
	}
	/** One authoritative snapshot; live attempts never alter durable resource knowledge. */
	applyStored(
		{ records, cursor, inventoryComplete }: StoredCache<WorkspaceRecord>,
		notify = true
	): void {
		if (this.state.read().stopped) return;
		this.state.update({
			readGeneration: this.state.read().readGeneration + 1,
			initializing: this.state.read().initializing ?? Promise.resolve(),
			cursor,
			inventoryComplete,
			entries: new Map(records.map(({ key, entry }) => [key, entry]))
		});
		for (const key of this.state.attempts().keys())
			if (!this.transfer(key)) this.state.removeAttempt(key);
		if (notify) this.notify();
	}

	private entry(key: string): ResourceState<WorkspaceRecord> | undefined {
		return this.state.read().entries.get(key);
	}
	private notify(): void {
		for (const listener of this.state.listeners()) listener();
	}
	private async restore(): Promise<void> {
		const generation = this.state.read().readGeneration + 1;
		this.state.update({ readGeneration: generation });
		const stored = (await this.storage.read(this.accountId)).cache;
		if (generation === this.state.read().readGeneration) this.applyStored(stored);
	}
	private async commit(
		put: readonly { key: string; received: SyncSnapshot<WorkspaceRecord> | ResourceDeletion }[],
		checkpoint?: {
			cursor: StoredCache<WorkspaceRecord>['cursor'] & string;
			inventoryComplete: boolean;
		}
	): Promise<void> {
		if (this.state.read().stopped) return;
		await this.storage.commitCache(this.accountId, {
			put: put.map(({ key, received }) => ({
				key,
				entry: this.rules.sync.receiveResource<WorkspaceRecord>(undefined, received)
			})),
			...(checkpoint ? { checkpoint } : {})
		});
		await this.restore();
	}
	/** The server answered for the resource asked about, not another. */
	private keyOf(record: WorkspaceRecord): string {
		return this.rules.commands.workspaceResourceKey(
			this.rules.commands.workspaceRecordIdentity(record)
		);
	}
	private async pullChanges(): Promise<SynchronizationResult> {
		try {
			await this.reload();
			if (this.state.read().stopped) return { kind: 'stopped' };
			if (!this.state.read().online) return { kind: 'offline' };
			let more: boolean;
			do {
				const before = this.state.read().cursor ?? initialSyncCursor;
				const batch = await this.transport.pull(this.accountId, before);
				for (const { key, resource } of batch.records)
					if (resource.kind === 'found' && this.keyOf(resource.snapshot.value) !== key)
						throw new Error('The server page returned a different resource');
				more = batch.hasMore;
				if (more && BigInt(batch.cursor) <= BigInt(before))
					throw new Error('The server page did not advance its checkpoint');
				if (BigInt(batch.cursor) < BigInt(this.state.read().cursor ?? initialSyncCursor))
					throw new Error('The server change cursor moved backwards');
				await this.commit(
					batch.records.map(({ key, resource }) => ({
						key,
						received: resource.kind === 'found' ? resource.snapshot : resource
					})),
					{
						cursor: batch.cursor,
						inventoryComplete: this.state.read().inventoryComplete || !more
					}
				);
				if (!this.state.read().online) return { kind: 'offline' };
			} while (more && !this.state.read().stopped);
			if (this.state.read().stopped) return { kind: 'stopped' };
			this.state.update({ result: { kind: 'complete' } });
			this.notify();
			return this.state.read().result;
		} catch (error) {
			if (this.state.read().stopped) return { kind: 'stopped' };
			const message = error instanceof Error ? error.message : 'Change synchronization failed';
			this.state.update({ result: { kind: 'failure', message } });
			this.notify();
			return { kind: 'failure', message };
		}
	}
	private fetch(key: string): Promise<SynchronizationResult> {
		const existing = this.state.fetching(key);
		if (existing) return existing;
		const request = this.read(key).finally(() => this.state.removeFetching(key));
		this.state.setFetching(key, request);
		return request;
	}
	private async waitForRead(key: string): Promise<SynchronizationResult> {
		const interrupted = Promise.withResolvers<SynchronizationResult>();
		const unsubscribe = this.subscribe(() => {
			if (this.state.read().stopped) interrupted.resolve({ kind: 'stopped' });
			else if (!this.state.read().online) interrupted.resolve({ kind: 'offline' });
		});
		try {
			return await Promise.race([this.fetch(key), interrupted.promise]);
		} finally {
			unsubscribe();
		}
	}
	/** The complete server version of one resource, as conflict review needs it. */
	async observe(
		key: string
	): Promise<Exclude<Awaited<ReturnType<WorkspaceTransport['read']>>, { kind: 'unchanged' }>> {
		const response = await this.download(key);
		if (response.kind === 'unchanged')
			throw new Error('Conflict review requires a complete server version');
		return response;
	}
	private async download(key: string) {
		const response = await this.transport.read(this.accountId, key, null);
		if (response.kind === 'found' && this.keyOf(response.snapshot.value) !== key)
			throw new Error('The server returned a different resource');
		return response;
	}
	private async read(key: string): Promise<SynchronizationResult> {
		try {
			const response = await this.download(key);
			if (this.state.read().stopped) return { kind: 'stopped' };
			if (response.kind === 'unchanged') throw new Error('An uncached read returned no body');
			if (response.kind === 'unavailable') {
				this.state.setAttempt(key, {
					target: this.rules.sync.resourceVersion(this.entry(key)),
					transfer: { kind: 'missing' }
				});
				this.notify();
				return { kind: 'unavailable' };
			}
			await this.commit([
				{ key, received: response.kind === 'found' ? response.snapshot : response }
			]);
			this.state.removeAttempt(key);
			return { kind: 'complete' };
		} catch (error) {
			if (this.state.read().stopped) return { kind: 'stopped' };
			const message =
				error instanceof Error ? error.message : 'The resource could not be downloaded';
			this.state.setAttempt(key, {
				target: this.rules.sync.resourceVersion(this.entry(key)),
				transfer: { kind: 'failed', message }
			});
			this.notify();
			return { kind: 'failure', message };
		}
	}
}

/** Coordinates the independent replication and submission lanes for one account. */
class ReplicaExecution implements AccountExecution {
	constructor(
		private readonly environment: WorkspaceEnvironment,
		private readonly state: SyncExecutionStore,
		private readonly scheduling: ISyncSchedulingService,
		private readonly lanes: {
			pull(): Promise<SubmissionResult>;
			writes(): Promise<SubmissionResult>;
			failed(message: string | null): void;
		}
	) {}
	get online(): boolean {
		return this.state.online;
	}
	get stopped(): boolean {
		return this.state.stopped;
	}
	get writeStatus(): SubmissionResult {
		return this.stopped
			? { kind: 'stopped' }
			: !this.online
				? { kind: 'offline' }
				: this.state.lane('writes').result;
	}
	get failure(): string | null {
		for (const lane of Object.values(this.laneStates()))
			if (lane.result.kind === 'failure') return lane.result.message;
		return null;
	}
	setOnline(online: boolean): void {
		if (this.stopped) return;
		this.state.setOnline(online);
		this.schedule();
	}
	stop(): void {
		this.state.stop();
		this.state.takeWake()?.();
	}
	retryNow(): void {
		if (this.stopped) return;
		for (const [id, retry] of this.state.writeRetries())
			this.state.setWriteRetry(id, { ...retry, at: 0 });
		for (const lane of ['pull', 'writes'] as const) this.state.updateLane(lane, { retry: null });
	}
	excludedWrites(): ReadonlySet<string> {
		return this.scheduling.excludedWrites(this.state.writeRetries(), this.environment.clock());
	}
	deferWrite(id: string): void {
		if (this.stopped) return;
		const attempts = (this.state.writeRetries().get(id)?.attempts ?? 0) + 1;
		this.state.setWriteRetry(id, {
			attempts,
			at: this.scheduling.retryAt(attempts, this.environment.clock())
		});
	}
	clearWriteRetry(id: string): void {
		this.state.deleteWriteRetry(id);
	}
	retainWriteRetries(ids: ReadonlySet<string>): void {
		for (const id of this.state.writeRetries().keys())
			if (!ids.has(id)) this.state.deleteWriteRetry(id);
	}
	async flushWrites(force = false): Promise<SubmissionResult> {
		if (force) this.retryNow();
		await this.request('writes');
		return this.writeStatus;
	}
	async synchronize(force = false): Promise<void> {
		if (force) this.retryNow();
		await Promise.all([this.request('pull'), this.request('writes')]);
	}
	committed(): void {
		void this.request('pull');
	}
	changed(): void {
		if (this.stopped) return;
		this.state.updateLane('writes', { retry: null });
		void this.request('writes');
	}
	private laneStates() {
		return { pull: this.state.lane('pull'), writes: this.state.lane('writes') };
	}
	private request(lane: SyncLane): Promise<void> {
		if (this.stopped) return Promise.resolve();
		this.state.updateLane(lane, { requested: true });
		const state = this.state.lane(lane);
		if (this.stopped || !this.online) return Promise.resolve();
		if (state.retry !== null && state.retry > this.environment.clock()) return Promise.resolve();
		if (state.running) return state.running;
		const running = this.run(lane).finally(() => {
			this.state.updateLane(lane, { running: null });
			this.schedule();
			const latest = this.state.lane(lane);
			if (latest.requested && latest.retry === null && !this.stopped && this.online)
				void this.request(lane);
		});
		this.state.updateLane(lane, { running });
		return running;
	}
	private async run(lane: SyncLane): Promise<void> {
		do {
			this.state.updateLane(lane, { requested: false, retry: null });
			let operationFailure = false;
			try {
				if (this.stopped || !this.online) return;
				const result = await this.lanes[lane]();
				if (this.stopped) return;
				this.state.updateLane(lane, { result });
				if (result.kind === 'failure') {
					operationFailure = lane === 'writes' && this.state.writeRetries().size > 0;
					throw new Error(result.message);
				}
				if (result.kind === 'waiting') this.deferLane(lane);
				else this.state.updateLane(lane, { failures: 0 });
				this.lanes.failed(this.failure);
				// audit-allow: silent-catch — the typed lane failure is retained for the account, reported to its subscriber and scheduled for retry.
			} catch (error) {
				if (this.stopped) return;
				this.state.updateLane(lane, {
					result: {
						kind: 'failure',
						message: error instanceof Error ? error.message : 'Workspace synchronization failed'
					}
				});
				if (!operationFailure) this.deferLane(lane);
				this.lanes.failed(this.failure);
				return;
			}
		} while (this.state.lane(lane).requested && !this.stopped && this.online);
	}
	private deferLane(lane: SyncLane): void {
		const failures = this.state.lane(lane).failures + 1;
		this.state.updateLane(lane, {
			failures,
			retry: this.scheduling.retryAt(failures, this.environment.clock())
		});
	}
	private schedule(): void {
		this.state.takeWake()?.();
		if (this.stopped || !this.online) return;
		const at = this.scheduling.wakeAt(this.laneStates(), this.state.writeRetries());
		if (at === null) return;
		this.state.setWake(
			this.environment.schedule(at, async () => {
				this.state.setWake(null);
				const due = this.scheduling.dueLanes(
					this.laneStates(),
					this.state.writeRetries(),
					this.environment.clock()
				);
				await Promise.all(due.map((lane) => this.request(lane)));
			})
		);
	}
}

/** Submissions are serialized per account; the durable queue owns ordering and recovery. */
class ReplicaSubmission implements AccountSubmission {
	private get online() {
		return this.execution.online;
	}
	private get stopped() {
		return this.execution.stopped;
	}
	constructor(
		readonly accountId: string,
		private readonly outbox: AccountOutbox,
		private readonly cache: AccountCache,
		private readonly transport: WorkspaceTransport,
		private readonly environment: WorkspaceEnvironment,
		private readonly state: MutationQueueStore<WorkspaceCommand, WorkspaceRecord>,
		private readonly execution: AccountExecution,
		private readonly rules: WorkspaceRules
	) {}

	get pending(): readonly Entry[] {
		return this.state.read().entries;
	}
	reviewDependents(operationId: string): readonly Entry[] {
		return this.rules.outboxEditing.dependents(this.pending, operationId);
	}
	acknowledged(key: string, operationId: string): boolean {
		return this.state.read().receipts.get(key)?.operationId === operationId;
	}
	get status(): SubmissionResult {
		return this.execution.writeStatus;
	}
	subscribe(listener: () => void): () => void {
		return this.state.subscribe(listener);
	}
	setOnline(online: boolean): void {
		this.execution.setOnline(online);
		this.notify();
	}
	stop(): void {
		this.execution.stop();
		this.state.clear();
		this.notify();
	}
	async reload(): Promise<void> {
		const generation = this.state.advanceGeneration();
		const state = await this.outbox.snapshot();
		if (generation === this.state.reloadGeneration) this.applyStored(state);
	}
	applyStored(state: OutboxProjection<WorkspaceCommand, WorkspaceRecord>, notify = true): void {
		if (this.stopped) return;

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
		this.execution.retainWriteRetries(retryable);
		this.state.replace(state);
		if (notify) this.notify();
	}

	async append(draft: Draft): Promise<string> {
		if (this.stopped) throw new Error('This account is no longer active');
		const id = await this.outbox.append(draft);
		await this.reload();
		return id;
	}
	async refreshConflict(operationId: string): Promise<void> {
		if (this.stopped || !this.online)
			throw new Error('Reconnect to read the current server version');
		await this.reload();
		const entry = this.state
			.read()
			.entries.find((entry) => entry.intent.operationId === operationId);
		if (!entry || entry.delivery.kind !== 'conflict')
			throw new Error('This change no longer needs conflict review');
		const remote = await this.cache.observe(entry.intent.key);
		await this.outbox.resolveBase(operationId, {
			kind: 'conflict',
			remote
		});
		await this.reload();
	}

	async keepLocal(operationId: string): Promise<string> {
		if (this.stopped) throw new Error('This account is no longer active');
		const replacementId = this.environment.operationId();
		await this.outbox.keepLocal(operationId, replacementId);
		await this.reload();
		return replacementId;
	}
	async discard(operationIds: readonly string[]): Promise<void> {
		if (this.stopped) throw new Error('This account is no longer active');
		await this.environment.writerLock(this.accountId, async () => {
			await this.outbox.recover();
			const all = await this.outbox.list();
			const selected = all.filter((entry) => operationIds.includes(entry.intent.operationId));
			if (
				selected.some((entry) =>
					this.rules.outboxEditing
						.dependents(all, entry.intent.operationId)
						.some((child) => !operationIds.includes(child.intent.operationId))
				)
			)
				throw new Error('Review dependent edits before discarding their base');
			if (selected.length !== operationIds.length)
				throw new Error('The selected local edits changed; review them again');
			for (const entry of selected) {
				if (entry.delivery.kind !== 'retry') continue;
				if (!this.online) throw new Error('Reconnect to confirm the last send before discarding');
				const outcome = await this.transport.cancel(this.accountId, {
					operationId: entry.intent.operationId,
					baseEtag: entry.intent.base?.etag ?? null,
					command: entry.intent.command
				});
				await this.outbox.settle(
					entry,
					outcome.kind === 'cancelled'
						? { kind: 'rejected', message: 'Cancelled before application' }
						: outcome
				);
				if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.stopped)
					this.execution.committed();
			}
			const remaining = await this.outbox.list();
			await this.outbox.discard(
				operationIds.filter((id) => remaining.some((entry) => entry.intent.operationId === id))
			);
		});
		await this.reload();
	}

	flush(force = false): Promise<SubmissionResult> {
		return this.execution.flushWrites(force);
	}
	retryNow(): void {
		this.execution.retryNow();
	}
	async submit(): Promise<SubmissionResult> {
		if (this.stopped) return { kind: 'stopped' };
		await this.reload();
		if (this.stopped) return { kind: 'stopped' };
		if (!this.online) return { kind: 'offline' };
		const ownership = await this.environment.tryWriterLock(
			this.accountId,
			async (): Promise<SubmissionResult> => {
				if (this.stopped) return { kind: 'stopped' };
				if (!this.online) return { kind: 'offline' };
				await this.outbox.recover();
				const excluded = new Set(this.execution.excludedWrites());
				let failure: SubmissionResult = { kind: 'complete' };
				while (!this.stopped && this.online) {
					const sent = await this.outbox.take(excluded);
					await this.reload();
					if (!sent) {
						if (this.rules.outboxDelivery.next(this.state.read().entries, excluded)) continue;
						const deferred = this.state
							.read()
							.entries.find((entry) => entry.delivery.kind === 'retry');
						return deferred?.delivery.kind === 'retry'
							? { kind: 'failure', message: deferred.delivery.message }
							: failure;
					}
					if (this.stopped) return { kind: 'stopped' };
					if (!this.online) return { kind: 'offline' };
					// Once taken, the input remains immutable even if the request's outcome is lost.
					const response = await this.send(sent);
					if (response.kind === 'failure') {
						await this.outbox.retry(sent.intent.operationId, response.message);
						await this.reload();
						this.execution.deferWrite(sent.intent.operationId);
						excluded.add(sent.intent.operationId);
						failure = { kind: 'failure', message: response.message };
						if (response.accountChanged) {
							this.execution.setOnline(false);
							return failure;
						}
						continue;
					}
					const outcome = response.outcome;
					await this.outbox.settle(sent, outcome);
					this.execution.clearWriteRetry(sent.intent.operationId);
					if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.stopped)
						this.execution.committed();
					await this.reload();
				}
				return this.stopped ? { kind: 'stopped' } : { kind: 'offline' };
			}
		);
		return ownership.kind === 'busy' ? { kind: 'waiting' } : ownership.value;
	}

	private async send(
		sent: Entry
	): Promise<
		| { kind: 'response'; outcome: WriteOutcome<WorkspaceRecord> }
		| { kind: 'failure'; message: string; accountChanged: boolean }
	> {
		try {
			if (this.environment.accountId !== this.accountId)
				throw new OutboxAccountChangedError(
					'Sign in to the original account before sending its saved edits.'
				);
			const outcome = await this.transport.send(this.accountId, {
				operationId: sent.intent.operationId,
				baseEtag: sent.intent.base?.etag ?? null,
				command: sent.intent.command
			});
			this.assertAnswered(sent, outcome);
			return { kind: 'response', outcome };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Submission failed',
				accountChanged: error instanceof OutboxAccountChangedError
			};
		}
	}

	/** The server answered for this operation and this resource, not another. */
	private assertAnswered(sent: Entry, result: WriteOutcome<WorkspaceRecord>): void {
		if (result.kind === 'applied' && result.receipt.operationId !== sent.intent.operationId)
			throw new Error('The server acknowledged a different operation');
		if (result.kind === 'proven' && result.proof.operationId !== sent.intent.operationId)
			throw new Error('The server acknowledged a different operation');
		const resource =
			result.kind === 'applied'
				? result.receipt.resource
				: result.kind === 'conflict'
					? result.remote
					: null;
		const commands = this.rules.commands;
		if (
			resource?.kind === 'found' &&
			commands.workspaceResourceKey(commands.workspaceRecordIdentity(resource.snapshot.value)) !==
				commands.workspaceResourceKey(commands.mutationResource(sent.intent.command))
		)
			throw new Error('The server returned a different resource');
	}

	notify(): void {
		for (const listener of this.state.listeners()) listener();
	}
}

// ===== Outbox =====

/**
 * Fields the server reassigns on every accepted write. Two edits that both touch them have not
 * collided; the server's own value replaces the replayed one when the rebased edit is applied.
 */
const bookkeeping: ReadonlySet<string> = new Set(['updatedAt', 'currentRevision', 'completedAt']);

/**
 * Widget data merges path by path and its revisions follow the server, so the generic replay
 * leaves those fields to the widget patch rules (ADR 0043).
 */
const widgetParts: ReadonlySet<string> = new Set([
	...bookkeeping,
	'data',
	'dataRevision',
	'layoutRevision'
]);

/** The widget edit rule: a candidate is read against the catalog, then decided. */
const validateWidget = (
	rules: WorkspaceRules,
	candidate: WidgetCandidate,
	catalog: WidgetCatalog
): WidgetEditResult => {
	const read = rules.widgetCandidates.read(candidate, catalog);
	return read.kind === 'invalid' ? read : rules.widgetEditing.decide(read.widget, read.issues);
};

/**
 * Every outbox transition: each reads the stored queue, decides and writes inside one IndexedDB
 * transaction, so another tab cannot interleave a write between the decision and its result.
 */
class ReplicaOutbox implements AccountOutbox {
	constructor(
		private readonly accountId: string,
		private readonly storage: WorkspaceStorage,
		private readonly rules: WorkspaceRules
	) {}

	list(): Promise<readonly Entry[]> {
		return this.storage.list(this.accountId);
	}
	async snapshot(): Promise<OutboxProjection<WorkspaceCommand, WorkspaceRecord>> {
		return (await this.storage.read(this.accountId)).writes;
	}
	async append(draft: Draft): Promise<string> {
		this.storage.validate(draft);
		return this.change(['outbox', 'records', 'receipts'], async (entries, tx) => {
			const receipt = await tx.receipt(draft.key);
			const rebased = this.ancestry(entries, draft, receipt);
			const current = await tx.resource(draft.key);
			const snapshot = this.rules.sync.cachedSnapshot(current);
			const observed =
				current?.kind === 'deleted'
					? current
					: snapshot
						? { kind: 'found' as const, snapshot }
						: { kind: 'unavailable' as const };
			// IndexedDB allocates order in the same transaction as the final intent. An abort also rolls back allocation.
			const sequence = await tx.allocate(rebased);
			const next = this.rules.outboxEditing.append(entries, rebased, sequence, receipt, observed);
			const appended = next.find((entry) => entry.intent.operationId === draft.operationId);
			if (!appended) throw new Error('The queued resource was not appended');
			if (appended.sequence !== sequence) await tx.removeAllocated(sequence);
			return { entries: next, result: appended.intent.operationId };
		});
	}
	async resolveBase(
		operationId: string,
		resolution: WriteBaseResolution<WorkspaceRecord>
	): Promise<void> {
		return this.change(['outbox', 'records'], async (entries, tx) => {
			const original = entries.find((entry) => entry.intent.operationId === operationId);
			if (original && resolution.remote.kind !== 'unavailable')
				await this.receive(original.intent.key, resolution.remote, tx);
			return {
				entries: this.rules.outboxEditing.resolveBase(entries, operationId, resolution),
				result: undefined
			};
		});
	}
	async keepLocal(operationId: string, replacementId: string): Promise<void> {
		return this.change(['outbox'], async (entries) => ({
			entries: this.rules.outboxEditing.keepLocal(entries, operationId, replacementId),
			result: undefined
		}));
	}
	async discard(operationIds: readonly string[]): Promise<void> {
		return this.change(['outbox'], async (entries) => ({
			entries: this.rules.outboxEditing.discard(entries, operationIds),
			result: undefined
		}));
	}
	async take(excluded: ReadonlySet<string> = new Set()): Promise<Entry | null> {
		return this.change(['outbox'], async (entries) => {
			const next = this.rules.outboxDelivery.next(entries, excluded);
			if (!next) return { entries, result: null };
			const sent = this.rules.outboxDelivery.begin(next);
			return { entries: entries.map((entry) => (entry === next ? sent : entry)), result: sent };
		});
	}
	async retry(operationId: string, message: string): Promise<void> {
		return this.change(['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				entry.intent.operationId === operationId
					? this.rules.outboxDelivery.fail(entry, message)
					: entry
			),
			result: undefined
		}));
	}
	/** Call only after acquiring the account's exclusive writer lock. */
	async recover(): Promise<void> {
		return this.change(['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				this.rules.outboxDelivery.fail(
					entry,
					'Interrupted submission; checking its operation proof'
				)
			),
			result: undefined
		}));
	}
	/** Queue acknowledgement and the authoritative cached resource commit atomically. */
	async settle(sent: Entry, outcome: WriteOutcome<WorkspaceRecord>): Promise<void> {
		return this.change(['outbox', 'records', 'receipts'], async (entries, tx) => {
			const settled = this.rules.outboxDelivery.settle(entries, sent.intent.operationId, outcome);
			const next =
				outcome.kind === 'conflict' ? this.conflicted(settled, sent.intent.operationId) : settled;
			if (outcome.kind === 'applied') {
				const previous = await tx.receipt(sent.intent.key);
				const receipt = this.rules.outboxDelivery.retainReceipt(previous, outcome.receipt);
				await tx.putReceipt(sent.intent.key, receipt);
			}
			const resource = this.rules.outboxDelivery.authoritativeResource(outcome);
			if (resource) await this.receive(sent.intent.key, resource, tx);
			return { entries: next, result: undefined };
		});
	}

	private receive(
		key: string,
		resource: WriteReceipt<WorkspaceRecord>['resource'],
		tx: OutboxUnitOfWork
	): Promise<void> {
		return tx.receiveResource(
			key,
			this.rules.sync.receiveResource<WorkspaceRecord>(
				undefined,
				resource.kind === 'found' ? resource.snapshot : resource
			)
		);
	}
	private change<R>(
		tables: readonly OutboxTable[],
		work: (
			entries: readonly Entry[],
			tx: OutboxUnitOfWork
		) => Promise<{ entries: readonly Entry[]; result: R }>
	): Promise<R> {
		return this.storage.transaction(this.accountId, tables, async (tx) => {
			const previous = await tx.entries();
			const change = await work(previous, tx);
			await tx.replace(previous, change.entries);
			return change.result;
		});
	}

	/** Workspace records replay field by field; a record never rebases onto another type. */
	private readonly rebase: WriteRebase<WorkspaceRecord> = (observed, local, onto) => {
		if (observed.type !== onto.type || local.type !== onto.type) return null;
		if (observed.type === 'widgets' && local.type === 'widgets' && onto.type === 'widgets') {
			const fields = this.rules.fields.rebaseFields(
				observed.value,
				local.value,
				onto.value,
				widgetParts
			);
			const { overlaps, ...parts } = this.rules.widgetPatches.rebaseParts(
				observed.value,
				local.value,
				onto.value
			);
			const candidate = { ...fields.value, ...parts };
			const validation = validateWidget(this.rules, candidate, widgetCatalog);
			return {
				value: { type: 'widgets', value: candidate },
				overlaps: fields.overlaps || overlaps || validation.kind !== 'applied'
			};
		}
		const rebased = this.rules.fields.rebaseFields(
			observed.value,
			local.value,
			onto.value,
			bookkeeping
		);
		const record = structuredClone(onto);
		Object.assign(record.value, rebased.value);
		return { value: record, overlaps: rebased.overlaps };
	};

	/**
	 * The durable queue, not the caller's in-memory copy, decides what a new edit is based on.
	 * A caller may have computed its edit from a version that an earlier local edit to the same
	 * resource has already superseded, for example when two quick edits start before the first is
	 * visible to the second. Those edits are this device's own history and precede the new edit, so
	 * the new edit's changed fields are replayed onto the latest local version and the edit is
	 * stacked on it. It then inherits that version's server base once the earlier edit is applied.
	 */
	private ancestry(
		entries: readonly Entry[],
		draft: Draft,
		receipt: WriteReceipt<WorkspaceRecord> | null
	): Draft {
		const latest = entries.findLast((entry) => entry.intent.key === draft.key);
		if (latest?.intent.operationId === draft.basedOn) return draft;
		const onto = latest
			? { base: latest.intent.base, basedOn: latest.intent.operationId, value: latest.intent.local }
			: receipt?.resource.kind === 'found' &&
				  draft.basedOn === null &&
				  draft.base !== null &&
				  this.rules.sync.compareSyncEtags(receipt.resource.snapshot.etag, draft.base.etag) > 0
				? { base: receipt.resource.snapshot, basedOn: null, value: receipt.resource.snapshot.value }
				: null;
		if (!onto) return draft;
		if (draft.local === null) return { ...draft, base: onto.base, basedOn: onto.basedOn };
		const parent = entries.find((entry) => entry.intent.operationId === draft.basedOn);
		const observed =
			draft.basedOn === null
				? (draft.base?.value ?? null)
				: parent
					? parent.intent.local
					: receipt?.operationId === draft.basedOn && receipt.resource.kind === 'found'
						? receipt.resource.snapshot.value
						: null;
		if (observed === null || onto.value === null) return draft;
		const rebased = this.rebase(observed, draft.local, onto.value);
		return rebased
			? { ...draft, base: onto.base, basedOn: onto.basedOn, local: rebased.value }
			: draft;
	}
	/**
	 * A version conflict is a question only when the server changed a field this edit also changed.
	 * Otherwise the edit is replayed onto the server version and queued again, and later local edits
	 * to the same resource are replayed onto the result. The operation keeps its identity: the server
	 * records nothing for an operation it answered with a conflict, so the attempt is concluded and
	 * drafts, receipts and dependents that name the operation stay valid. Deletions, creations and
	 * overlapping fields stay for review.
	 */
	private conflicted(entries: readonly Entry[], operationId: string): readonly Entry[] {
		const conflict = entries.find((entry) => entry.intent.operationId === operationId);
		if (
			conflict?.delivery.kind !== 'conflict' ||
			conflict.delivery.remote.kind !== 'found' ||
			conflict.intent.base === null ||
			conflict.intent.local === null
		)
			return entries;
		const remote = conflict.delivery.remote.snapshot;
		const rebased = this.rebase(conflict.intent.base.value, conflict.intent.local, remote.value);
		if (!rebased || rebased.overlaps) return entries;
		let previous = { from: conflict.intent.local, to: rebased.value };
		return entries.map((entry): Entry => {
			if (entry === conflict)
				return {
					...entry,
					intent: { ...entry.intent, base: remote, basedOn: null, local: rebased.value },
					delivery: { kind: 'queued' }
				};
			const local = entry.intent.local;
			if (entry.intent.key !== conflict.intent.key || entry.sequence < conflict.sequence || !local)
				return entry;
			const replayed = this.rebase(previous.from, local, previous.to);
			if (!replayed) return entry;
			previous = { from: local, to: replayed.value };
			return { ...entry, intent: { ...entry.intent, local: replayed.value } };
		});
	}
}

// ===== Command preparation =====

const todoWrite = (
	identity: WorkspaceCommandRules,
	rules: TodoEditingRules,
	todo: Todo,
	patch: Omit<UpdateTodoInput, 'todoId'>,
	timestamp: Todo['updatedAt']
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateTodo', todoId: todo.id, ...patch },
	local: { type: 'todos', value: rules.edit(todo, patch, timestamp) },
	coalesce: null,
	references: patch.linkedNoteId
		? [identity.workspaceResourceKey({ type: 'notes', id: [patch.linkedNoteId] })]
		: []
});

/** Initial representations use client IDs; server acknowledgment replaces only authoritative fields. */
const newProject = (
	rules: ProjectDetailRules,
	id: ProjectId,
	userId: UserId,
	name: string,
	timestamp: DateTime
): Project => {
	const decision = rules.decide({ name });
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return {
		id,
		userId,
		name: decision.name,
		role: 'workspace',
		createdAt: timestamp,
		updatedAt: timestamp
	};
};

const newNote = (
	rules: NoteCreationRules,
	id: NoteId,
	project: Project,
	title: string,
	kind: 'note' | 'folder',
	entries: readonly Note[],
	timestamp: DateTime,
	parentId?: NoteId
): Note => {
	const decision = rules.decideCreation(
		{ id, title, kind, parentId },
		{
			project,
			parent: entries.find((entry) => entry.id === parentId) ?? null,
			siblingCount: entries.filter(
				(entry) => entry.projectId === project.id && entry.parentId === parentId
			).length
		},
		timestamp
	);
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return decision.note;
};

/** Match the trash placement rules while retaining the complete local note. */
const noteTrashWrite = (
	identity: WorkspaceCommandRules,
	rules: NoteTrashRules,
	note: Note,
	action: 'archive' | 'restore',
	notes: readonly Note[],
	timestamp: DateTime
): WriteContent<WorkspaceCommand, WorkspaceRecord> => {
	const decision = rules.changeTrash(
		note,
		action === 'archive'
			? {
					kind: 'archive',
					hasActiveChildren: notes.some((entry) => entry.parentId === note.id && !entry.archivedAt)
				}
			: {
					kind: 'restore',
					parent: notes.find((entry) => entry.id === note.parentId) ?? null,
					rootSiblingCount: notes.filter(
						(entry) => entry.projectId === note.projectId && !entry.parentId
					).length
				},
		timestamp
	);
	if (decision.kind === 'invalid') throw new Error(decision.message);
	const local = decision.note;
	return {
		command: { kind: action === 'archive' ? 'archiveNote' : 'restoreNote', noteId: note.id },
		local: { type: 'notes', value: local },
		coalesce: null,
		references:
			action === 'restore' && local.parentId
				? [identity.workspaceResourceKey({ type: 'notes', id: [local.parentId] })]
				: []
	};
};

const newMemory = (
	id: MemoryEntryId,
	userId: UserId,
	input: CreateMemoryEntryInput,
	timestamp: DateTime,
	editing: IMemoryEditingService
): MemoryEntry => {
	const decision = editing.create(input, { id, userId, timestamp });
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return decision.entry;
};

const memoryWrite = (
	entry: MemoryEntry,
	patch: Omit<UpdateMemoryEntryInput, 'memoryEntryId'>,
	editing: IMemoryEditingService
): WriteContent<WorkspaceCommand, WorkspaceRecord> => {
	const decision = editing.edit(entry, patch, entry.updatedAt);
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return {
		command: { kind: 'updateMemory', memoryEntryId: entry.id, ...patch },
		local: { type: 'memory_entries', value: decision.entry },
		coalesce: null,
		references: []
	};
};

const skillMetadataWrite = (
	entry: WorkspaceValues['skills'],
	patch: Omit<Extract<WorkspaceCommand, { kind: 'updateSkill' }>, 'kind' | 'noteId'>,
	editing: SkillMetadataEditing
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateSkill', noteId: entry.noteId, ...patch },
	local: {
		type: 'skills',
		value: {
			...entry,
			...editing.edit(entry, patch),
			name: patch.displayName?.trim() || entry.name
		}
	},
	coalesce: null,
	references: []
});

const agentPreferenceWrite = (
	editing: AgentPreferenceEditing,
	entry: WorkspaceValues['agent_preferences'],
	patch: UpdateAgentPreferencesInput,
	timestamp: DateTime
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateAgentPreferences', userId: entry.userId, patch },
	local: { type: 'agent_preferences', value: editing.apply(entry, patch, timestamp) },
	coalesce: null,
	references: []
});

/** Commands whose meaning depends on a complete collection rather than one loaded record. */
function workspaceCommandNeedsInventory(
	identity: WorkspaceCommandRules,
	rules: NoteTrashRules,
	command: PreparedWorkspaceCommand,
	observed: WorkspaceRecord | null,
	records: ReadonlyMap<string, WorkspaceRecord>
): boolean {
	switch (command.kind) {
		case 'createNote':
		case 'createFolder':
			return true;
		case 'archiveNote':
			return observed?.type === 'notes' && observed.value.kind === 'folder';
		case 'restoreNote': {
			if (observed?.type !== 'notes') return false;
			const parent = observed.value.parentId
				? records.get(
						identity.workspaceResourceKey({ type: 'notes', id: [observed.value.parentId] })
					)
				: undefined;
			const decision = rules.restorePlacement(
				observed.value,
				parent?.type === 'notes' ? parent.value : null
			);
			return decision.kind === 'restore' && decision.placement === 'root';
		}
		default:
			return false;
	}
}

/** The optimistic widget for a create or edit, or the reason the edit cannot be shown. */
const appliedWidget = (result: WidgetEditResult): Widget => {
	switch (result.kind) {
		case 'applied':
			return result.widget;
		case 'stale':
			throw new Error(`The widget ${result.part} changed since it was loaded`);
		case 'invalid':
			throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
	}
};

/** Derive local effects from the command and the version this editor actually observed. */
interface WorkspaceCommandSource {
	readonly accountId: string;
	readonly records: ReadonlyMap<string, WorkspaceRecord>;
	readonly pending: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[];
	collectionReadiness(): 'unknown' | 'ready';
	requireCollections(): Promise<void>;
}

/** Resolve required inventory and prepare the complete optimistic command from observed facts. */
class ReplicaCommands implements AccountCommands {
	constructor(private readonly rules: WorkspaceRules) {}
	async prepare(
		command: PreparedWorkspaceCommand,
		observed: WorkspaceRecord | null,
		workspace: WorkspaceCommandSource,
		now: DateTime
	): Promise<WriteContent<WorkspaceCommand, WorkspaceRecord>> {
		const createsEntry = command.kind === 'createNote' || command.kind === 'createFolder';
		const projectId = createsEntry
			? command.projectId
			: observed?.type === 'notes'
				? observed.value.projectId
				: null;
		const newParentId = createsEntry
			? command.parentId
			: command.kind === 'archiveNote'
				? command.noteId
				: null;
		// A queued creation establishes an empty starting collection for its new identity.
		const knownNewScope = workspace.pending.some(
			({ intent }) =>
				(intent.command.kind === 'createProject' && intent.command.id === projectId) ||
				(intent.command.kind === 'createFolder' && intent.command.id === newParentId)
		);
		if (
			workspaceCommandNeedsInventory(
				this.rules.commands,
				this.rules.noteTrash,
				command,
				observed,
				workspace.records
			) &&
			!knownNewScope
		)
			await workspace.requireCollections();
		return this.apply(command, observed, {
			userId: workspace.accountId as UserId,
			now,
			records: workspace.records,
			inventory:
				knownNewScope || workspace.collectionReadiness() === 'ready' ? 'complete' : 'partial'
		});
	}
	private apply(
		command: PreparedWorkspaceCommand,
		observed: WorkspaceRecord | null,
		context: WorkspaceCommandContext
	): WriteContent<WorkspaceCommand, WorkspaceRecord> {
		if (
			workspaceCommandNeedsInventory(
				this.rules.commands,
				this.rules.noteTrash,
				command,
				observed,
				context.records
			) &&
			context.inventory !== 'complete'
		)
			throw new Error(
				'Required workspace data is not available on this device. Reconnect and retry.'
			);
		const { userId, now, records } = context;
		const value = <K extends WorkspaceRecord['type']>(type: K): WorkspaceValues[K] => {
			if (!observed || !this.rules.commands.isWorkspaceRecord(observed, type))
				throw new Error('Open the resource before editing');
			return observed.value;
		};
		const content = (
			local: WorkspaceRecord | null,
			references: readonly string[] = [],
			coalesce: string | null = null
		): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
			command,
			local,
			references,
			coalesce
		});
		const projectKey = (id: ProjectId) =>
			this.rules.commands.workspaceResourceKey({ type: 'projects', id: [id] });
		const notes = () =>
			[...records.values()]
				.filter((record) => record.type === 'notes')
				.map((record) => record.value);
		switch (command.kind) {
			case 'createProject':
				return content({
					type: 'projects',
					value: newProject(this.rules.projectDetails, command.id, userId, command.name, now)
				});
			case 'createNote':
			case 'createFolder': {
				const project = records.get(projectKey(command.projectId));
				if (project?.type !== 'projects') throw new Error('The project is unavailable');
				const note = newNote(
					this.rules.noteCreation,
					command.id,
					project.value,
					command.kind === 'createNote' ? command.title : command.name,
					command.kind === 'createNote' ? 'note' : 'folder',
					notes(),
					now,
					command.parentId
				);
				return content({ type: 'notes', value: note }, [
					projectKey(command.projectId),
					...(command.parentId
						? [
								this.rules.commands.workspaceResourceKey({
									type: 'notes',
									id: [command.parentId]
								})
							]
						: [])
				]);
			}
			case 'renameProject': {
				const decision = this.rules.projectDetails.decide(command);
				if (decision.kind === 'invalid') throw new Error(decision.message);
				return content({
					type: 'projects',
					value: {
						...value('projects'),
						name: decision.name,
						updatedAt: now
					}
				});
			}
			case 'archiveProject':
				return content({
					type: 'projects',
					value: { ...value('projects'), archivedAt: now, updatedAt: now }
				});
			case 'projectNumbering':
				return content({
					type: 'projects',
					value: { ...value('projects'), sectionNumberingDefault: command.enabled, updatedAt: now }
				});
			case 'renameNote':
				return content({
					type: 'notes',
					value: { ...value('notes'), title: command.title.trim(), updatedAt: now }
				});
			case 'noteNumbering':
				return content({
					type: 'notes',
					value: { ...value('notes'), sectionNumbering: command.enabled, updatedAt: now }
				});
			case 'saveNote': {
				const note = value('notes');
				return content(
					{
						type: 'notes',
						value: this.rules.noteEditing.edit(note, command, now)
					},
					[],
					'document'
				);
			}
			case 'publishNote': {
				const note = value('notes');
				return content({
					type: 'notes',
					value: { ...note, publishedRevision: note.currentRevision, publishedAt: now }
				});
			}
			case 'archiveNote':
			case 'restoreNote':
				return noteTrashWrite(
					this.rules.commands,
					this.rules.noteTrash,
					value('notes'),
					command.kind === 'archiveNote' ? 'archive' : 'restore',
					notes(),
					now
				);
			case 'createTodo': {
				const decision = this.rules.todoCreation.create(command, {
					id: command.id,
					userId,
					timestamp: now
				});
				if (decision.kind === 'invalid') throw new Error(decision.message);
				return content({ type: 'todos', value: decision.todo }, [projectKey(command.projectId)]);
			}
			case 'updateTodo': {
				const { kind, todoId, ...patch } = command;
				void kind;
				void todoId;
				return todoWrite(this.rules.commands, this.rules.todoEditing, value('todos'), patch, now);
			}
			case 'createMemory':
				return content(
					{
						type: 'memory_entries',
						value: newMemory(command.id, userId, command, now, this.rules.memoryEditing)
					},
					command.projectId ? [projectKey(command.projectId)] : []
				);
			case 'updateMemory': {
				const { kind, memoryEntryId, ...patch } = command;
				void kind;
				void memoryEntryId;
				return memoryWrite(value('memory_entries'), patch, this.rules.memoryEditing);
			}
			case 'deleteTodo':
			case 'deleteMemory':
			case 'resetProjectToolOverride':
				return content(null);
			case 'renameConversation':
				return content({
					type: 'conversations',
					value: { ...value('conversations'), title: command.title.trim(), updatedAt: now }
				});
			case 'updateSkill': {
				const { kind, noteId, ...patch } = command;
				void kind;
				void noteId;
				return skillMetadataWrite(value('skills'), patch, this.rules.skillMetadata);
			}
			case 'updateAgentPreferences':
				return agentPreferenceWrite(
					this.rules.agentPreferences,
					value('agent_preferences'),
					command.patch,
					now
				);
			case 'updateUserPreferences':
				return content({
					type: 'user_preferences',
					value: {
						...value('user_preferences'),
						sectionNumberingDefault: command.sectionNumberingDefault,
						updatedAt: now
					}
				});
			case 'updateExportSettings':
				return content(
					{
						type: 'export_settings',
						value: {
							...value('export_settings'),
							settings: this.rules.exportSettings.validate(command.settings),
							updatedAt: now
						}
					},
					[projectKey(command.projectId)]
				);
			case 'updateTrustPolicy':
				return content({
					type: 'trust_policies',
					value: {
						...value('trust_policies'),
						autoAcceptEnabled: command.autoAcceptEnabled,
						minimumConfidence: command.minimumConfidence,
						updatedAt: now
					}
				});
			case 'setToolPreference':
				return content({
					type: 'tool_preferences',
					value: { ...value('tool_preferences'), enabled: command.enabled, updatedAt: now }
				});
			case 'setProjectToolOverride':
				return content(
					{
						type: 'project_tool_overrides',
						value: { ...value('project_tool_overrides'), enabled: command.enabled, updatedAt: now }
					},
					[projectKey(command.projectId)]
				);
			case 'renameDiagram':
				return content({
					type: 'diagrams',
					value: { ...value('diagrams'), title: command.title.trim(), updatedAt: now }
				});
			case 'archiveDiagram':
			case 'restoreDiagram':
			case 'deleteDiagram': {
				const diagram = value('diagrams');
				const action =
					command.kind === 'archiveDiagram'
						? 'archive'
						: command.kind === 'restoreDiagram'
							? 'restore'
							: 'delete';
				if (action === 'delete') {
					const decision = this.rules.diagramLifecycle.decide(action, diagram);
					if (decision.kind === 'invalid') throw new Error(decision.message);
					return content(null);
				}
				const decision = this.rules.diagramLifecycle.change(action, diagram, now);
				if (decision.kind === 'invalid') throw new Error(decision.message);
				return content({ type: 'diagrams', value: decision.diagram });
			}
			case 'saveDiagram':
			case 'publishDiagram': {
				const diagram = value('diagrams');
				if (diagram.kind !== 'drawio') throw new Error('Only draw.io diagrams can be edited');
				const decision = this.rules.diagramEditing.revision(
					{
						kind: command.kind === 'saveDiagram' ? 'save' : 'publish',
						baseMatches: true,
						contentChanged: diagram.source !== command.source
					},
					diagram
				);
				if (decision.kind === 'conflict')
					throw new Error('The diagram changed since it was loaded');
				const revision =
					decision.kind === 'write' ? decision.currentRevision : diagram.currentRevision;
				return content(
					{
						type: 'diagrams',
						value: {
							...diagram,
							source: command.source,
							currentRevision: revision,
							updatedAt: now,
							...(command.kind === 'publishDiagram'
								? {
										renderedSvg: command.renderedSvg,
										publishedRevision: revision,
										publishedAt: now
									}
								: {})
						}
					},
					[],
					command.kind === 'saveDiagram' ? 'document' : null
				);
			}
			case 'createWidget':
				return content(
					{
						type: 'widgets',
						value: appliedWidget(
							this.createWidget(
								command.draft,
								{
									id: command.id,
									userId,
									projectId: command.projectId,
									...(command.sourceNoteId ? { sourceNoteId: command.sourceNoteId } : {}),
									now
								},
								widgetCatalog
							)
						)
					},
					[projectKey(command.projectId)]
				);
			case 'editWidget':
				return content({
					type: 'widgets',
					value: appliedWidget(
						this.applyWidgetChange(value('widgets'), command.change, widgetCatalog, now)
					)
				});
			case 'archiveWidget':
			case 'restoreWidget': {
				const change = this.rules.widgetLifecycle.change(
					command.kind === 'archiveWidget' ? 'archive' : 'restore',
					value('widgets'),
					now
				);
				if (change.kind === 'invalid') throw new Error(change.message);
				return content({ type: 'widgets', value: change.widget });
			}
			case 'deleteWidget': {
				const decision = this.rules.widgetLifecycle.decide('delete', value('widgets'));
				if (decision.kind === 'invalid') throw new Error(decision.message);
				return content(null);
			}
			default:
				throw new Error(`Unhandled command: ${command satisfies never}`);
		}
	}
	/** A new widget, validated like every widget write (ADR 0043). */
	private createWidget(
		draft: WidgetDraft,
		creation: WidgetCreation,
		catalog: WidgetCatalog
	): WidgetEditResult {
		return validateWidget(
			this.rules,
			this.rules.widgetEditing.create(draft, creation, catalog.version),
			catalog
		);
	}
	private applyWidgetChange(
		widget: Widget,
		change: WidgetChange,
		catalog: WidgetCatalog,
		now: DateTime
	): WidgetEditResult {
		if (change.kind === 'parts') {
			const data = this.rules.widgetPatches.propose(
				widget,
				{ kind: 'data', patch: change.data },
				catalog.version,
				now
			);
			if (data.kind === 'invalid') return data;
			const read = this.rules.widgetCandidates.read(data.widget, catalog);
			if (read.kind === 'invalid') return read;
			// Preserve data-shape failure precedence. Semantic and catalog issues belong
			// to the completed pair: the new layout may repair an intermediate issue.
			return this.applyWidgetChange(
				read.widget,
				{ kind: 'layout', patch: change.layout },
				catalog,
				now
			);
		}
		const proposal = this.rules.widgetPatches.propose(widget, change, catalog.version, now);
		if (proposal.kind === 'invalid') return proposal;
		// Renaming has never revalidated an unchanged stored layout or data.
		if (proposal.change === 'rename') return { kind: 'applied', widget: proposal.widget };
		return validateWidget(this.rules, proposal.widget, catalog);
	}
}
