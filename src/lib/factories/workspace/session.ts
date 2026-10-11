import { readWorkspaceBootstrap } from '$lib/remote/workspace/bootstrap.remote';
import { pullWorkspaceChangePage, readWorkspaceResource } from '$lib/remote/workspace/sync.remote';
import {
	cancelWorkspaceMutation,
	pushWorkspaceMutation
} from '$lib/remote/workspace/mutations.remote';
import {
	AgentModelSelectionService,
	AgentModelChoiceService
} from '$lib/services/agent/model-selection';
import { WorkspaceReadinessRulesService } from '$lib/services/workspace/startup';
import {
	SyncResourceRulesService,
	OutboxEditingService,
	OutboxDeliveryService
} from '$lib/services/sync/state';
import { SyncSchedulingService } from '$lib/services/sync/scheduling';
import { FieldReplayService } from '$lib/services/sync/rebase';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { AgentPreferenceEditingService } from '$lib/services/agent/preferences';
import { ExportSettingsRuleService } from '$lib/services/deliverables/settings';
import { DiagramRuleService } from '$lib/services/diagrams/editing';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { NoteLifecycleService } from '$lib/services/notes/lifecycle';
import { NoteEditingService } from '$lib/services/notes/editing';
import { ProjectRules } from '$lib/services/projects/rules';
import { MemoryEditingService } from '$lib/services/memory/edits';
import { WidgetLifecycleService } from '$lib/services/widgets/trash';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import { WidgetEditingService } from '$lib/services/widgets/edits';
import { CatalogWidgetCandidateReader } from '$lib/infrastructure/widgets/candidate-reader';
import {
	Workspace,
	type WorkspaceController,
	type WorkspaceRules
} from '$lib/controllers/workspace/workspace';
import type { WorkspaceStores } from '$lib/stores/workspace/stores';
import type { WorkspaceViewsController } from '$lib/controllers/workspace/views';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import { WorkspaceResourceStore } from '$lib/stores/workspace/resources.svelte';
import { WorkspaceDraftStore, ResourceObservationStore } from '$lib/stores/workspace/draft.svelte';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
import { ResourceCacheStore } from '$lib/stores/sync/cache';
import { MutationQueueStore } from '$lib/stores/sync/submission';
import { SyncExecutionStore } from '$lib/stores/sync/execution';
import {
	WorkspaceStorageService,
	type WorkspaceStorage
} from '$lib/client/services/workspace/storage';
import {
	RemoteWorkspaceTransport,
	type WorkspaceTransport
} from '$lib/client/services/workspace/transport';
import { IndexedDbWorkspaceReplica } from '$lib/client/repositories/workspace/replica';
import { LocalStorageBootstrap } from '$lib/client/repositories/workspace/bootstrap';
import { BrowserWorkspaceEnvironment } from '$lib/client/workspace/environment.svelte';
import { workspaceRecordSchema, type WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceCommandSchema, type WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceEnvironment } from '$lib/controllers/workspace/workspace';
import { workspaceViewsOver } from './views';

export const createWorkspaceRules = (): WorkspaceRules => ({
	readiness: new WorkspaceReadinessRulesService(),
	sync: new SyncResourceRulesService(),
	outboxEditing: new OutboxEditingService(),
	outboxDelivery: new OutboxDeliveryService(),
	scheduling: new SyncSchedulingService(),
	fields: new FieldReplayService(),
	commands: new WorkspaceCommandRulesService(),
	exportSettings: new ExportSettingsRuleService(),
	diagramRules: new DiagramRuleService(),
	skillMetadata: new SkillMetadataEditingService(),
	todoCreation: new TodoEditingRulesService(),
	todoEditing: new TodoEditingRulesService(),
	widgetPatches: new WidgetPatchService(),
	widgetCandidates: new CatalogWidgetCandidateReader(),
	widgetEditing: new WidgetEditingService(),
	widgetLifecycle: new WidgetLifecycleService(),
	memoryEditing: new MemoryEditingService(),
	projectDetails: new ProjectRules(),
	noteCreation: new NoteLifecycleService(),
	noteTrash: new NoteLifecycleService(),
	noteEditing: new NoteEditingService(),
	agentPreferences: new AgentPreferenceEditingService(),
	modelSelection: new AgentModelSelectionService(),
	modelChoices: new AgentModelChoiceService()
});

/** One account-bound workspace and the read models over the projection it replicates into. */
export interface WorkspaceGraph {
	readonly workspace: WorkspaceController;
	readonly views: WorkspaceViewsController;
}

const workspaceStores = (): WorkspaceStores => ({
	session: new WorkspaceSessionStore(),
	projection: new WorkspaceProjectionStore(new Map()),
	account: () => ({
		resources: new WorkspaceResourceStore(),
		cache: new ResourceCacheStore<WorkspaceRecord>(),
		queue: new MutationQueueStore<WorkspaceCommand, WorkspaceRecord>(),
		execution: new SyncExecutionStore()
	}),
	draft: () => new WorkspaceDraftStore(),
	observation: () => new ResourceObservationStore()
});

/** One workspace graph: tests supply their own storage, transport and environment. */
export const createWorkspaceGraph = (
	storage: WorkspaceStorage,
	transport: WorkspaceTransport,
	environment: WorkspaceEnvironment
): WorkspaceGraph => {
	const stores = workspaceStores();
	return {
		workspace: new Workspace(stores, storage, transport, environment, createWorkspaceRules()),
		views: workspaceViewsOver(stores.projection, stores.session)
	};
};

/** The browser application graph. Construction does not start the account. */
export const workspaceApplication: WorkspaceGraph = createWorkspaceGraph(
	new WorkspaceStorageService(
		new IndexedDbWorkspaceReplica(workspaceCommandSchema, workspaceRecordSchema),
		new LocalStorageBootstrap()
	),
	new RemoteWorkspaceTransport({
		bootstrap: () => readWorkspaceBootstrap({}),
		pull: (input) => pullWorkspaceChangePage(input),
		read: (input) => readWorkspaceResource(input),
		push: (input) => pushWorkspaceMutation(input),
		cancel: (input) => cancelWorkspaceMutation(input)
	}),
	new BrowserWorkspaceEnvironment()
);

export const workspaceSession: WorkspaceController = workspaceApplication.workspace;

/** The signed-in account's read models, over the same projection the workspace replicates into. */
export const workspaceViews: WorkspaceViewsController = workspaceApplication.views;
