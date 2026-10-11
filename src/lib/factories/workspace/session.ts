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
import { DiagramEditingService } from '$lib/services/diagrams/editing';
import { DiagramLifecycleService } from '$lib/services/diagrams/trash';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { NoteLifecycleService } from '$lib/services/notes/lifecycle';
import { NoteEditingService } from '$lib/services/notes/editing';
import { ProjectDetailService } from '$lib/services/projects/details';
import { MemoryEditingService } from '$lib/services/memory/edits';
import { WidgetLifecycleService } from '$lib/services/widgets/trash';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import { WidgetEditingService } from '$lib/services/widgets/edits';
import { CatalogWidgetCandidateReader } from '$lib/infrastructure/widgets/candidate-reader';
import {
	Workspace,
	type WorkspaceController,
	type WorkspaceRules,
	type WorkspaceStores
} from '$lib/controllers/workspace/workspace';
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
import { createWorkspaceViews } from './views';

export const createWorkspaceRules = (): WorkspaceRules => ({
	readiness: new WorkspaceReadinessRulesService(),
	sync: new SyncResourceRulesService(),
	outboxEditing: new OutboxEditingService(),
	outboxDelivery: new OutboxDeliveryService(),
	scheduling: new SyncSchedulingService(),
	fields: new FieldReplayService(),
	commands: new WorkspaceCommandRulesService(),
	exportSettings: new ExportSettingsRuleService(),
	diagramEditing: new DiagramEditingService(),
	diagramLifecycle: new DiagramLifecycleService(),
	skillMetadata: new SkillMetadataEditingService(),
	todoCreation: new TodoEditingRulesService(),
	todoEditing: new TodoEditingRulesService(),
	widgetPatches: new WidgetPatchService(),
	widgetCandidates: new CatalogWidgetCandidateReader(),
	widgetEditing: new WidgetEditingService(),
	widgetLifecycle: new WidgetLifecycleService(),
	memoryEditing: new MemoryEditingService(),
	projectDetails: new ProjectDetailService(),
	noteCreation: new NoteLifecycleService(),
	noteTrash: new NoteLifecycleService(),
	noteEditing: new NoteEditingService(),
	agentPreferences: new AgentPreferenceEditingService(),
	modelSelection: new AgentModelSelectionService(),
	modelChoices: new AgentModelChoiceService()
});

export const createWorkspaceStores = (
	session = new WorkspaceSessionStore(),
	projection = new WorkspaceProjectionStore(new Map())
): WorkspaceStores => ({
	session,
	projection,
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
export const createWorkspace = (
	stores: WorkspaceStores,
	storage: WorkspaceStorage,
	transport: WorkspaceTransport,
	environment: WorkspaceEnvironment
): WorkspaceController =>
	new Workspace(stores, storage, transport, environment, createWorkspaceRules());

const stores = createWorkspaceStores();

/** One browser application graph. Construction does not start the account. */
export const workspaceSession: WorkspaceController = createWorkspace(
	stores,
	new WorkspaceStorageService(
		new IndexedDbWorkspaceReplica(workspaceCommandSchema, workspaceRecordSchema),
		new LocalStorageBootstrap()
	),
	new RemoteWorkspaceTransport(),
	new BrowserWorkspaceEnvironment()
);

/** The signed-in account's read models, over the same projection the workspace replicates into. */
export const workspaceViews: WorkspaceViewsController = createWorkspaceViews(
	stores.projection,
	stores.session
);
