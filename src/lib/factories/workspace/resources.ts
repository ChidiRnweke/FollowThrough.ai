import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { createWorkspaceCommands } from '$lib/factories/workspace/commands';
import { BrowserWorkspaceEditingEnvironment } from '$lib/client/workspace/editing-environment.svelte';
import type { WorkspaceResourceType, WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceEditorCoordinator } from '$lib/controllers/workspace/resources';
import {
	WorkspaceResources,
	WorkspaceDraft,
	ResourceView,
	type WorkspaceResourcesController,
	type WorkspaceResourcesDependencies
} from '$lib/controllers/workspace/resources';
import { WorkspaceResourceStore } from '$lib/stores/workspace/resources.svelte';
import { WorkspaceDraftStore, ResourceObservationStore } from '$lib/stores/workspace/draft.svelte';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
import { WorkspaceViews } from '$lib/controllers/workspace/views';
import { createCachePersistence } from '$lib/factories/sync/cache-persistence';
import { createDurableOutbox } from '$lib/factories/sync/durable-outbox';
import { DexieWorkspaceRepository } from '$lib/client/sync/workspace-local-repository';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import { rebaseWorkspaceRecord } from '$lib/controllers/workspace/rebase';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createMutationQueue } from '$lib/factories/sync/submission';
import { browserWriterLock } from '$lib/client/sync/browser-writer-lock';
import {
	workspaceReadTransport,
	workspaceWriteTransport
} from '$lib/client/sync/workspace-transport';
export const assembleWorkspaceResources = (
	accountId: string,
	dependencies: WorkspaceResourcesDependencies
): WorkspaceResourcesController => {
	const projection = new WorkspaceProjectionStore(new Map());
	const environment = new BrowserWorkspaceEditingEnvironment();
	return new WorkspaceResources(
		accountId,
		dependencies,
		new WorkspaceResourceStore(),
		projection,
		new WorkspaceViews(
			new TodoPresentationService(),
			projection,
			new SuggestionPresentationService(),
			new MemoryPresentationService(),
			new ProjectTreePresentationService(),
			new NotePresentationService(),
			new NoteSectionNumberingService()
		),
		{
			view: <K extends WorkspaceResourceType>(
				resources: WorkspaceResourcesController,
				identity: WorkspaceResourceIdentity & { type: K }
			) => new ResourceView<K>(resources, identity, new ResourceObservationStore(), environment),
			draft: <K extends WorkspaceResourceType>(
				resources: WorkspaceEditorCoordinator,
				identity: WorkspaceResourceIdentity & { type: K }
			) => new WorkspaceDraft<K>(resources, identity, new WorkspaceDraftStore(), environment)
		},
		environment,
		createWorkspaceCommands()
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
	const cache = createResourceCache(accountId, {
		repository: {
			load: async (account) => (await repository.read(account)).cache,
			commit: (account, changes) => cachePersistence.commit(account, changes)
		},
		transport: workspaceReadTransport(accountId)
	});
	const { writes, execution } = createMutationQueue(accountId, {
		repository: repositoryWrites,
		transport: workspaceWriteTransport(accountId),
		scheduler: browserSyncScheduler,
		writerLock: browserWriterLock,
		pull: () => cache.refresh()
	});
	return assembleWorkspaceResources(accountId, {
		repository,
		cache,
		writes,
		execution,

		dispose: () => repository.database.stop()
	});
};
