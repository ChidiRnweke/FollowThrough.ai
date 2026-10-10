import { AttachmentPresentationService } from '$lib/services/attachments/presentation';
import { CatalogWidgetCandidateReader } from '$lib/adapters/widgets/candidate-reader';
import { browserWriterLock } from '$lib/client/sync/browser-writer-lock';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
import { DexieWorkspaceRepository } from '$lib/client/sync/workspace-local-repository';
import {
	workspaceReadTransport,
	workspaceWriteTransport
} from '$lib/client/sync/workspace-transport';
import { BrowserWorkspaceEditingEnvironment } from '$lib/client/workspace/editing-environment.svelte';
import { BrowserWorkspaceSynchronization } from '$lib/controllers/sync/browser-workspace';
import { MutationSubmission } from '$lib/controllers/sync/submission';
import type { WorkspaceEditorCoordinator } from '$lib/controllers/workspace/resources';
import {
	ResourceView,
	WorkspaceDraft,
	WorkspaceResources,
	type WorkspaceResourcesController,
	type WorkspaceResourcesDependencies
} from '$lib/controllers/workspace/resources';
import { WorkspaceViews } from '$lib/controllers/workspace/views';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createCachePersistence } from '$lib/factories/sync/cache-persistence';
import { createDurableOutbox } from '$lib/factories/sync/durable-outbox';
import { createWorkspaceCommands } from '$lib/factories/workspace/commands';
import { rebaseWorkspaceRecord } from '$lib/factories/workspace/rebase';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity, WorkspaceResourceType } from '$lib/models/workspace-sync';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { WriteAncestryService } from '$lib/services/sync/ancestry';
import { WorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import { SyncSchedulingService } from '$lib/services/sync/scheduling';
import {
	CacheCommitService,
	OutboxDeliveryService,
	OutboxEditingService
} from '$lib/services/sync/state';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WidgetEditingService } from '$lib/services/widgets/edits';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import { WorkspaceDraftService } from '$lib/services/workspace/draft';
import { ResourceCacheStore } from '$lib/stores/sync/cache';
import { SyncExecutionStore } from '$lib/stores/sync/execution';
import { MutationQueueStore } from '$lib/stores/sync/submission';
import { ResourceObservationStore, WorkspaceDraftStore } from '$lib/stores/workspace/draft.svelte';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
import { WorkspaceResourceStore } from '$lib/stores/workspace/resources.svelte';
import { workspaceAccounts, workspaceDraftStates } from './capabilities';
export const assembleWorkspaceResources = (
	accountId: string,
	dependencies: WorkspaceResourcesDependencies,
	data = new WorkspaceResourceStore(),
	projection = new WorkspaceProjectionStore(new Map())
): WorkspaceResourcesController => {
	const environment = new BrowserWorkspaceEditingEnvironment();
	return new WorkspaceResources(
		accountId,
		dependencies,
		data,
		projection,
		new WorkspaceViews(
			new TodoPresentationService(),
			projection,
			new SuggestionPresentationService(),
			new MemoryPresentationService(),
			new ProjectTreePresentationService(),
			new NotePresentationService(),
			new NoteSectionNumberingService(),
			new AttachmentPresentationService()
		),
		{
			view: <K extends WorkspaceResourceType>(
				resources: WorkspaceResourcesController,
				identity: WorkspaceResourceIdentity & { type: K }
			) => new ResourceView<K>(resources, identity, new ResourceObservationStore(), environment),
			draft: <K extends WorkspaceResourceType>(
				resources: WorkspaceEditorCoordinator,
				identity: WorkspaceResourceIdentity & { type: K }
			) => {
				const state = new WorkspaceDraftStore();
				const draft = new WorkspaceDraft<K>(
					resources,
					identity,
					state,
					environment,
					new WorkspaceDraftService()
				);
				workspaceDraftStates.set(draft, state);
				return draft;
			}
		},
		environment,
		createWorkspaceCommands(),
		new WorkspaceDraftService()
	);
};
export const createWorkspaceResources = (accountId: string): WorkspaceResourcesController => {
	const repository = new DexieWorkspaceRepository(
		accountId,
		workspaceCommandSchema,
		workspaceRecordSchema
	);
	const repositoryWrites = createDurableOutbox(repository, rebaseWorkspaceRecord);
	const cachePersistence = createCachePersistence(repository.cache);
	const cacheState = new ResourceCacheStore<WorkspaceRecord>();
	const executionState = new SyncExecutionStore();
	const queueState = new MutationQueueStore<WorkspaceCommand, WorkspaceRecord>();
	const readTransport = workspaceReadTransport(accountId);
	const writeTransport = workspaceWriteTransport(accountId);
	const cache = createResourceCache(
		accountId,
		{
			repository: {
				load: async (account) => (await repository.read(account)).cache,
				commit: (account, changes) => cachePersistence.commit(account, changes)
			},
			transport: readTransport
		},
		cacheState
	);

	const resourceState = new WorkspaceResourceStore();
	const projectionState = new WorkspaceProjectionStore(new Map());
	const account = {
		accountId,
		repository,
		outbox: repository,
		cacheStorage: repository.cache,
		readTransport,
		writeTransport,
		writerLock: browserWriterLock,
		scheduler: browserSyncScheduler,
		resourceState,
		projectionState,
		cacheState,
		executionState,
		queueState,
		ancestry: new WriteAncestryService(),
		cacheMerge: new CacheCommitService(),
		editing: new OutboxEditingService(),
		delivery: new OutboxDeliveryService(),
		scheduling: new SyncSchedulingService(),
		fields: new WorkspaceFieldReplayService(),
		widgetPatches: new WidgetPatchService(),
		widgetEditing: new WidgetEditingService(),
		widgetReader: new CatalogWidgetCandidateReader()
	};
	const execution = new BrowserWorkspaceSynchronization(account);
	const writes = new MutationSubmission(
		accountId,
		{ repository: repositoryWrites, transport: writeTransport, writerLock: browserWriterLock },
		queueState,
		execution,
		account.editing,
		account.delivery
	);

	const resources = assembleWorkspaceResources(
		accountId,
		{
			repository,
			cache,
			writes,
			execution,

			dispose: () => repository.database.stop()
		},
		resourceState,
		projectionState
	);
	workspaceAccounts.set(resources, { ...account, dispose: () => repository.database.stop() });
	return resources;
};
