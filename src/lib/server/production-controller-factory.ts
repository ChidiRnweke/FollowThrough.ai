import { Agent, type AgentDependencies } from './controllers/agent/controller';
import {
	AgentSettings,
	type AgentSettingsDependencies
} from './controllers/agent/settings/controller';
import {
	ToolPreferences,
	type ToolPreferencesDependencies
} from './controllers/agent/tool-preferences/controller';
import {
	TrustPolicies,
	type TrustPoliciesDependencies
} from './controllers/agent/trust-policies/controller';
import { ApiTokens, type ApiTokensDependencies } from './controllers/api-tokens/controller';
import { Attachments, type AttachmentsDependencies } from './controllers/attachments/controller';
import { Deliverables, type DeliverablesDependencies } from './controllers/deliverables/controller';
import { Diagrams, type DiagramsDependencies } from './controllers/diagrams/controller';
import { Feedback, type FeedbackDependencies } from './controllers/feedback/controller';
import { NoteImportsController } from './controllers/imports/controller';
import {
	InlineSuggestions,
	type InlineSuggestionsDependencies
} from './controllers/inline-suggestions/controller';
import { Retrieval, type RetrievalDependencies } from './controllers/knowledge-search/controller';
import { Memory, type MemoryDependencies } from './controllers/memory/controller';
import { Notes, type NotesDependencies } from './controllers/notes/controller';
import { Projects, type ProjectsDependencies } from './controllers/projects/controller';
import { References, type ReferencesDependencies } from './controllers/references/controller';
import {
	Relationships,
	type RelationshipsDependencies
} from './controllers/relationships/controller';
import { Skills, type SkillsDependencies } from './controllers/skills/controller';
import { Suggestions, type SuggestionsDependencies } from './controllers/suggestions/controller';
import { Todos, type TodosDependencies } from './controllers/todos/controller';
import { Workspace, type WorkspaceDependencies } from './controllers/workspace/controller';
import type { ControllerFactory } from './controller-factory';
import { instrumentedController } from './controllers/instrumentation';

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
	// Every controller is wrapped at construction: one `domain.method` span plus
	// info/debug/error logs per call, covering UI, MCP and agent-tool callers.
	workspace() {
		return instrumentedController('workspace', new Workspace(this.dependencies.workspace));
	}
	projects() {
		return instrumentedController('projects', new Projects(this.dependencies.projects));
	}
	notes() {
		return instrumentedController('notes', new Notes(this.dependencies.notes));
	}
	todos() {
		return instrumentedController('todos', new Todos(this.dependencies.todos));
	}
	relationships() {
		return instrumentedController(
			'relationships',
			new Relationships(this.dependencies.relationships)
		);
	}
	references() {
		return instrumentedController('references', new References(this.dependencies.references));
	}
	diagrams() {
		return instrumentedController('diagrams', new Diagrams(this.dependencies.diagrams));
	}
	suggestions() {
		return instrumentedController('suggestions', new Suggestions(this.dependencies.suggestions));
	}
	skills() {
		return instrumentedController('skills', new Skills(this.dependencies.skills));
	}
	agent() {
		return instrumentedController('agent', new Agent(this.dependencies.agent));
	}
	agentSettings() {
		return instrumentedController(
			'agentSettings',
			new AgentSettings(this.dependencies.agentSettings)
		);
	}
	apiTokens() {
		return instrumentedController('apiTokens', new ApiTokens(this.dependencies.apiTokens));
	}
	toolPreferences() {
		return instrumentedController(
			'toolPreferences',
			new ToolPreferences(this.dependencies.toolPreferences)
		);
	}
	attachments() {
		return instrumentedController('attachments', new Attachments(this.dependencies.attachments));
	}
	deliverables() {
		return instrumentedController('deliverables', new Deliverables(this.dependencies.deliverables));
	}
	trustPolicies() {
		return instrumentedController(
			'trustPolicies',
			new TrustPolicies(this.dependencies.trustPolicies)
		);
	}
	memory() {
		return instrumentedController('memory', new Memory(this.dependencies.memory));
	}
	retrieval() {
		return instrumentedController('retrieval', new Retrieval(this.dependencies.retrieval));
	}
	inlineSuggestions() {
		return instrumentedController(
			'inlineSuggestions',
			new InlineSuggestions(this.dependencies.inlineSuggestions)
		);
	}
	feedback() {
		return instrumentedController('feedback', new Feedback(this.dependencies.feedback));
	}
	// Composes the notes and projects controllers rather than taking repositories of its
	// own: an import is a batch of ordinary creates, and going through the controllers
	// keeps indexing and anchor repair on the same path a hand-made note takes.
	imports() {
		return new NoteImportsController({ notes: this.notes(), projects: this.projects() });
	}
}
