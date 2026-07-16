import type {
	AgentController,
	AgentSettingsController,
	AttachmentsController,
	DiagramsController,
	NotesController,
	ProjectsController,
	ReferencesController,
	RelationshipsController,
	SkillsController,
	SuggestionsController,
	TodosController,
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
	attachments(): AttachmentsController;
	trustPolicies(): TrustPoliciesController;
}
