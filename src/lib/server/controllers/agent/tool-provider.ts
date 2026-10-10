import type { AgentFilesController } from '$lib/server/controllers/agent-files/controller';
import type { AgentSettingsController } from '$lib/server/controllers/agent/settings/controller';
import type { ToolPreferencesController } from '$lib/server/controllers/agent/tool-preferences/controller';
import type { TrustPoliciesController } from '$lib/server/controllers/agent/trust-policies/controller';
import type { ApiTokensController } from '$lib/server/controllers/api-tokens/controller';
import type { AttachmentsController } from '$lib/server/controllers/attachments/controller';
import type { DeliverablesController } from '$lib/server/controllers/deliverables/controller';
import type { DiagramStudioController } from '$lib/server/controllers/diagram-studio/controller';
import type { DiagramsController } from '$lib/server/controllers/diagrams/controller';
import type { RetrievalController } from '$lib/server/controllers/knowledge-search/controller';
import type { MemoryController } from '$lib/server/controllers/memory/controller';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import type { ProjectsController } from '$lib/server/controllers/projects/controller';
import type { ReferencesController } from '$lib/server/controllers/references/controller';
import type { RelationshipsController } from '$lib/server/controllers/relationships/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { SuggestionsController } from '$lib/server/controllers/suggestions/controller';
import type { TodosController } from '$lib/server/controllers/todos/controller';
import type { WidgetsController } from '$lib/server/controllers/widgets/controller';
import type { WorkspaceController } from '$lib/server/controllers/workspace/controller';
export interface AgentToolControllerProvider {
	agentFiles(): Pick<AgentFilesController, 'grep' | 'ls' | 'sed'>;
	agentSettings(): Pick<
		AgentSettingsController,
		'getPreferences' | 'listModels' | 'updatePreferences'
	>;
	apiTokens(): Pick<ApiTokensController, 'list' | 'revoke'>;
	attachments(): Pick<AttachmentsController, 'list'>;
	deliverables(): Pick<
		DeliverablesController,
		| 'deleteArtifact'
		| 'downloadArtifact'
		| 'generateDocument'
		| 'getArtifact'
		| 'getExportSettings'
		| 'listArtifacts'
		| 'listTemplates'
		| 'regenerateArtifact'
		| 'updateExportSettings'
	>;
	diagramStudio(): Pick<
		DiagramStudioController,
		| 'createDiagram'
		| 'editDiagram'
		| 'readCanvasDiagram'
		| 'readProjectDiagram'
		| 'searchDiagramIcons'
	>;
	diagrams(): Pick<DiagramsController, 'promote' | 'reviseMermaid'>;
	memory(): Pick<MemoryController, 'list' | 'propose'>;
	notes(): Pick<
		NotesController,
		| 'applyReviewedChange'
		| 'archive'
		| 'compareRevisions'
		| 'create'
		| 'deleteForever'
		| 'discardDraft'
		| 'emptyTrash'
		| 'getForAgent'
		| 'listRevisions'
		| 'listTrash'
		| 'prepareChange'
		| 'publish'
		| 'rename'
		| 'restore'
		| 'restoreRevision'
	>;
	projects(): Pick<
		ProjectsController,
		'archive' | 'create' | 'createFolder' | 'get' | 'list' | 'move' | 'rename'
	>;
	references(): Pick<ReferencesController, 'suggestFromSelection'>;
	relationships(): Pick<RelationshipsController, 'suggestFromSelection'>;
	retrieval(): Pick<RetrievalController, 'search'>;
	skills(): Pick<
		SkillsController,
		| 'create'
		| 'createFromSelection'
		| 'list'
		| 'listVersions'
		| 'loadForAgent'
		| 'restoreVersion'
		| 'setPinned'
		| 'update'
	>;
	suggestions(): Pick<SuggestionsController, 'acceptReviewed' | 'list' | 'reject' | 'revert'>;
	todos(): Pick<TodosController, 'create' | 'createBatch' | 'extractPromises' | 'list' | 'update'>;
	toolPreferences(): Pick<ToolPreferencesController, 'list' | 'setEnabled'>;
	trustPolicies(): Pick<TrustPoliciesController, 'list' | 'update'>;
	widgets(): Pick<WidgetsController, 'catalog' | 'create' | 'edit' | 'get' | 'list'>;
	workspace(): Pick<WorkspaceController, 'getShellContext' | 'getTodayView'>;
}
