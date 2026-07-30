import {
	Agent,
	AgentSettings,
	ApiTokens,
	Attachments,
	Deliverables,
	Diagrams,
	Feedback,
	NoteImportsController,
	InlineSuggestions,
	Memory,
	Notes,
	Projects,
	References,
	Relationships,
	Retrieval,
	Skills,
	Suggestions,
	Todos,
	ToolPreferences,
	TrustPolicies,
	Workspace,
	type AgentDependencies,
	type AgentSettingsDependencies,
	type ApiTokensDependencies,
	type AttachmentsDependencies,
	type DeliverablesDependencies,
	type FeedbackDependencies,
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
} from './controllers';
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
	feedback: FeedbackDependencies;
}

export class ProductionControllerFactory implements ControllerFactory {
	constructor(private readonly dependencies: ProductionControllerDependencies) {}
	workspace() {
		return new Workspace(this.dependencies.workspace);
	}
	projects() {
		return new Projects(this.dependencies.projects);
	}
	notes() {
		return new Notes(this.dependencies.notes);
	}
	todos() {
		return new Todos(this.dependencies.todos);
	}
	relationships() {
		return new Relationships(this.dependencies.relationships);
	}
	references() {
		return new References(this.dependencies.references);
	}
	diagrams() {
		return new Diagrams(this.dependencies.diagrams);
	}
	suggestions() {
		return new Suggestions(this.dependencies.suggestions);
	}
	skills() {
		return new Skills(this.dependencies.skills);
	}
	agent() {
		return new Agent(this.dependencies.agent);
	}
	agentSettings() {
		return new AgentSettings(this.dependencies.agentSettings);
	}
	apiTokens() {
		return new ApiTokens(this.dependencies.apiTokens);
	}
	toolPreferences() {
		return new ToolPreferences(this.dependencies.toolPreferences);
	}
	attachments() {
		return new Attachments(this.dependencies.attachments);
	}
	deliverables() {
		return new Deliverables(this.dependencies.deliverables);
	}
	trustPolicies() {
		return new TrustPolicies(this.dependencies.trustPolicies);
	}
	memory() {
		return new Memory(this.dependencies.memory);
	}
	retrieval() {
		return new Retrieval(this.dependencies.retrieval);
	}
	inlineSuggestions() {
		return new InlineSuggestions(this.dependencies.inlineSuggestions);
	}
	feedback() {
		return new Feedback(this.dependencies.feedback);
	}
	// Composes the notes and projects controllers rather than taking repositories of its
	// own: an import is a batch of ordinary creates, and going through the controllers
	// keeps indexing and anchor repair on the same path a hand-made note takes.
	imports() {
		return new NoteImportsController({ notes: this.notes(), projects: this.projects() });
	}
}
