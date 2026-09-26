import { controllerSurfaces } from './controller-surfaces';
import { Agent, type AgentDependencies } from '../controllers/agent/controller';
import { AgentFiles, type AgentFilesDependencies } from '../controllers/agent-files/controller';
import {
	AgentSettings,
	type AgentSettingsDependencies
} from '../controllers/agent/settings/controller';
import {
	ToolPreferences,
	type ToolPreferencesDependencies
} from '../controllers/agent/tool-preferences/controller';
import {
	TrustPolicies,
	type TrustPoliciesDependencies
} from '../controllers/agent/trust-policies/controller';
import { ApiTokens, type ApiTokensDependencies } from '../controllers/api-tokens/controller';
import { Attachments, type AttachmentsDependencies } from '../controllers/attachments/controller';
import {
	Deliverables,
	type DeliverablesDependencies
} from '../controllers/deliverables/controller';
import { Diagrams, type DiagramsDependencies } from '../controllers/diagrams/controller';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '../controllers/diagram-studio/controller';
import { Feedback, type FeedbackDependencies } from '../controllers/feedback/controller';
import {
	InlineSuggestions,
	type InlineSuggestionsDependencies
} from '../controllers/inline-suggestions/controller';
import { Retrieval, type RetrievalDependencies } from '../controllers/knowledge-search/controller';
import { Memory, type MemoryDependencies } from '../controllers/memory/controller';
import { Notes, type NotesDependencies } from '../controllers/notes/controller';
import { Projects, type ProjectsDependencies } from '../controllers/projects/controller';
import { References, type ReferencesDependencies } from '../controllers/references/controller';
import {
	Relationships,
	type RelationshipsDependencies
} from '../controllers/relationships/controller';
import { Skills, type SkillsDependencies } from '../controllers/skills/controller';
import { Suggestions, type SuggestionsDependencies } from '../controllers/suggestions/controller';
import { Todos, type TodosDependencies } from '../controllers/todos/controller';
import {
	UserSettings,
	type UserSettingsDependencies
} from '../controllers/user-settings/controller';
import { Workspace, type WorkspaceDependencies } from '../controllers/workspace/controller';
import type { ControllerFactory } from './controller-factory';
import { instrumentedController } from '../controllers/instrumentation';

export interface ProductionControllerDependencies {
	agentFiles: AgentFilesDependencies;
	workspace: WorkspaceDependencies;
	projects: ProjectsDependencies;
	notes: NotesDependencies;
	todos: TodosDependencies;
	relationships: RelationshipsDependencies;
	references: ReferencesDependencies;
	diagrams: DiagramsDependencies;
	diagramStudio: DiagramStudioDependencies;
	suggestions: SuggestionsDependencies;
	skills: SkillsDependencies;
	agent: AgentDependencies;
	agentSettings: AgentSettingsDependencies;
	userSettings: UserSettingsDependencies;
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
	agentFiles() {
		return instrumentedController(
			'agentFiles',
			new AgentFiles(this.dependencies.agentFiles),
			controllerSurfaces.agentFiles
		);
	}
	workspace() {
		return instrumentedController(
			'workspace',
			new Workspace(this.dependencies.workspace),
			controllerSurfaces.workspace
		);
	}
	projects() {
		return instrumentedController(
			'projects',
			new Projects(this.dependencies.projects),
			controllerSurfaces.projects
		);
	}
	notes() {
		return instrumentedController(
			'notes',
			new Notes(this.dependencies.notes),
			controllerSurfaces.notes
		);
	}
	todos() {
		return instrumentedController(
			'todos',
			new Todos(this.dependencies.todos),
			controllerSurfaces.todos
		);
	}
	relationships() {
		return instrumentedController(
			'relationships',
			new Relationships(this.dependencies.relationships),
			controllerSurfaces.relationships
		);
	}
	references() {
		return instrumentedController(
			'references',
			new References(this.dependencies.references),
			controllerSurfaces.references
		);
	}
	diagrams() {
		return instrumentedController(
			'diagrams',
			new Diagrams(this.dependencies.diagrams),
			controllerSurfaces.diagrams
		);
	}
	diagramStudio() {
		return instrumentedController(
			'diagramStudio',
			new DiagramStudio(this.dependencies.diagramStudio),
			controllerSurfaces.diagramStudio
		);
	}
	suggestions() {
		return instrumentedController(
			'suggestions',
			new Suggestions(this.dependencies.suggestions),
			controllerSurfaces.suggestions
		);
	}
	skills() {
		return instrumentedController(
			'skills',
			new Skills(this.dependencies.skills),
			controllerSurfaces.skills
		);
	}
	agent() {
		return instrumentedController(
			'agent',
			new Agent(this.dependencies.agent),
			controllerSurfaces.agent
		);
	}
	agentSettings() {
		return instrumentedController(
			'agentSettings',
			new AgentSettings(this.dependencies.agentSettings),
			controllerSurfaces.agentSettings
		);
	}
	userSettings() {
		return instrumentedController(
			'userSettings',
			new UserSettings(this.dependencies.userSettings),
			controllerSurfaces.userSettings
		);
	}
	apiTokens() {
		return instrumentedController(
			'apiTokens',
			new ApiTokens(this.dependencies.apiTokens),
			controllerSurfaces.apiTokens
		);
	}
	toolPreferences() {
		return instrumentedController(
			'toolPreferences',
			new ToolPreferences(this.dependencies.toolPreferences),
			controllerSurfaces.toolPreferences
		);
	}
	attachments() {
		return instrumentedController(
			'attachments',
			new Attachments(this.dependencies.attachments),
			controllerSurfaces.attachments
		);
	}
	deliverables() {
		return instrumentedController(
			'deliverables',
			new Deliverables(this.dependencies.deliverables),
			controllerSurfaces.deliverables
		);
	}
	trustPolicies() {
		return instrumentedController(
			'trustPolicies',
			new TrustPolicies(this.dependencies.trustPolicies),
			controllerSurfaces.trustPolicies
		);
	}
	memory() {
		return instrumentedController(
			'memory',
			new Memory(this.dependencies.memory),
			controllerSurfaces.memory
		);
	}
	retrieval() {
		return instrumentedController(
			'retrieval',
			new Retrieval(this.dependencies.retrieval),
			controllerSurfaces.retrieval
		);
	}
	inlineSuggestions() {
		return instrumentedController(
			'inlineSuggestions',
			new InlineSuggestions(this.dependencies.inlineSuggestions),
			controllerSurfaces.inlineSuggestions
		);
	}
	feedback() {
		return instrumentedController(
			'feedback',
			new Feedback(this.dependencies.feedback),
			controllerSurfaces.feedback
		);
	}
}
