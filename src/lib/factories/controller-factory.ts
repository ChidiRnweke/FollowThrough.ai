import type {
	AgentController,
	AgentSettingsController,
	ApiTokensController,
	AttachmentsController,
	DeliverablesController,
	DiagramsController,
	ImportsController,
	InlineSuggestionsController,
	MemoryController,
	NotesController,
	ProjectsController,
	ReferencesController,
	RelationshipsController,
	RetrievalController,
	SkillsController,
	SuggestionsController,
	TodosController,
	ToolPreferencesController,
	TrustPoliciesController,
	WorkspaceController
} from '../controllers';

export interface ControllerFactory {
	workspace(): WorkspaceController;
	projects(): ProjectsController;
	notes(): NotesController;
	todos(): TodosController;
	relationships(): RelationshipsController;
	references(): ReferencesController;
	diagrams(): DiagramsController;
	suggestions(): SuggestionsController;
	skills(): SkillsController;
	agent(): AgentController;
	agentSettings(): AgentSettingsController;
	apiTokens(): ApiTokensController;
	toolPreferences(): ToolPreferencesController;
	attachments(): AttachmentsController;
	deliverables(): DeliverablesController;
	trustPolicies(): TrustPoliciesController;
	memory(): MemoryController;
	retrieval(): RetrievalController;
	inlineSuggestions(): InlineSuggestionsController;
	imports(): ImportsController;
}
