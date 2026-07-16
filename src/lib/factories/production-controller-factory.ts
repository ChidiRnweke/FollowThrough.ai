import {
	DefaultAgentController,
	DefaultAgentSettingsController,
	DefaultAttachmentsController,
	DefaultDiagramsController,
	DefaultNotesController,
	DefaultProjectsController,
	DefaultReferencesController,
	DefaultRelationshipsController,
	DefaultSkillsController,
	DefaultSuggestionsController,
	DefaultTodosController,
	DefaultTrustPoliciesController,
	DefaultWorkspaceController,
	type AgentDependencies,
	type AgentSettingsDependencies,
	type AttachmentsDependencies,
	type DiagramsDependencies,
	type NotesDependencies,
	type ProjectsDependencies,
	type ReferencesDependencies,
	type RelationshipsDependencies,
	type SkillsDependencies,
	type SuggestionsDependencies,
	type TodosDependencies,
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
	attachments: AttachmentsDependencies;
	trustPolicies: TrustPoliciesDependencies;
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
	attachments() {
		return new DefaultAttachmentsController(this.dependencies.attachments);
	}
	trustPolicies() {
		return new DefaultTrustPoliciesController(this.dependencies.trustPolicies);
	}
}
