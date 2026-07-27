import {
	DefaultAgentController,
	DefaultAgentSettingsController,
	DefaultApiTokensController,
	DefaultAttachmentsController,
	DefaultDeliverablesController,
	DefaultDiagramsController,
	DefaultImportsController,
	DefaultInlineSuggestionsController,
	DefaultMemoryController,
	DefaultNotesController,
	DefaultProjectsController,
	DefaultReferencesController,
	DefaultRelationshipsController,
	DefaultRetrievalController,
	DefaultSkillsController,
	DefaultSuggestionsController,
	DefaultTodosController,
	DefaultToolPreferencesController,
	DefaultTrustPoliciesController,
	DefaultWorkspaceController,
	type AgentDependencies,
	type AgentSettingsDependencies,
	type ApiTokensDependencies,
	type AttachmentsDependencies,
	type DeliverablesDependencies,
	type DiagramsDependencies,
	type InlineSuggestionsDependencies,
	type MemoryDependencies,
	type NotesDependencies,
	type ProjectsDependencies,
	type ReferencesDependencies,
	type RelationshipsDependencies,
	type RetrievalDependencies,
	type SkillsDependencies,
	type SuggestionsDependencies,
	type TodosDependencies,
	type ToolPreferencesDependencies,
	type TrustPoliciesDependencies,
	type WorkspaceDependencies
} from '../controllers';
import type { ControllerFactory } from './controller-factory';

export interface ProductionControllerDependencies {
	workspace: WorkspaceDependencies;
	projects: ProjectsDependencies;
	notes: NotesDependencies;
	todos: TodosDependencies;
	relationships: RelationshipsDependencies;
	references: ReferencesDependencies;
	diagrams: DiagramsDependencies;
	suggestions: SuggestionsDependencies;
	skills: SkillsDependencies;
	agent: AgentDependencies;
	agentSettings: AgentSettingsDependencies;
	apiTokens: ApiTokensDependencies;
	toolPreferences: ToolPreferencesDependencies;
	attachments: AttachmentsDependencies;
	deliverables: DeliverablesDependencies;
	trustPolicies: TrustPoliciesDependencies;
	memory: MemoryDependencies;
	retrieval: RetrievalDependencies;
	inlineSuggestions: InlineSuggestionsDependencies;
}

export class ProductionControllerFactory implements ControllerFactory {
	constructor(private readonly dependencies: ProductionControllerDependencies) {}
	workspace() {
		return new DefaultWorkspaceController(this.dependencies.workspace);
	}
	projects() {
		return new DefaultProjectsController(this.dependencies.projects);
	}
	notes() {
		return new DefaultNotesController(this.dependencies.notes);
	}
	todos() {
		return new DefaultTodosController(this.dependencies.todos);
	}
	relationships() {
		return new DefaultRelationshipsController(this.dependencies.relationships);
	}
	references() {
		return new DefaultReferencesController(this.dependencies.references);
	}
	diagrams() {
		return new DefaultDiagramsController(this.dependencies.diagrams);
	}
	suggestions() {
		return new DefaultSuggestionsController(this.dependencies.suggestions);
	}
	skills() {
		return new DefaultSkillsController(this.dependencies.skills);
	}
	agent() {
		return new DefaultAgentController(this.dependencies.agent);
	}
	agentSettings() {
		return new DefaultAgentSettingsController(this.dependencies.agentSettings);
	}
	apiTokens() {
		return new DefaultApiTokensController(this.dependencies.apiTokens);
	}
	toolPreferences() {
		return new DefaultToolPreferencesController(this.dependencies.toolPreferences);
	}
	attachments() {
		return new DefaultAttachmentsController(this.dependencies.attachments);
	}
	deliverables() {
		return new DefaultDeliverablesController(this.dependencies.deliverables);
	}
	trustPolicies() {
		return new DefaultTrustPoliciesController(this.dependencies.trustPolicies);
	}
	memory() {
		return new DefaultMemoryController(this.dependencies.memory);
	}
	retrieval() {
		return new DefaultRetrievalController(this.dependencies.retrieval);
	}
	inlineSuggestions() {
		return new DefaultInlineSuggestionsController(this.dependencies.inlineSuggestions);
	}
	// Composes the notes and projects controllers rather than taking repositories of its
	// own: an import is a batch of ordinary creates, and going through the controllers
	// keeps indexing and anchor repair on the same path a hand-made note takes.
	imports() {
		return new DefaultImportsController({ notes: this.notes(), projects: this.projects() });
	}
}
