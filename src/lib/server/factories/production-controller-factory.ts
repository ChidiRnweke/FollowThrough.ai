import { TodayPresentationService } from '$lib/services/workspace/today';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { RelationshipCandidatesService } from '$lib/services/relationships/candidates';
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
import { Widgets, type WidgetsDependencies } from '../controllers/widgets/controller';
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
import { instrumentedController } from './controller-instrumentation';

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
	widgets: WidgetsDependencies;
	retrieval: RetrievalDependencies;
	inlineSuggestions: InlineSuggestionsDependencies;
	feedback: FeedbackDependencies;
}

export class ProductionControllerFactory implements ControllerFactory {
	constructor(private readonly dependencies: ProductionControllerDependencies) {}
	// Every controller is wrapped at construction: one `domain.method` span plus
	// info/debug/error logs per call, covering UI, MCP and agent-tool callers.
	agentFiles(): ReturnType<ControllerFactory['agentFiles']> {
		return instrumentedController(
			'agentFiles',
			new AgentFiles(this.dependencies.agentFiles),
			controllerSurfaces.agentFiles
		);
	}
	workspace(): ReturnType<ControllerFactory['workspace']> {
		return instrumentedController(
			'workspace',
			new Workspace(new TodayPresentationService(), this.dependencies.workspace),
			controllerSurfaces.workspace
		);
	}
	projects(): ReturnType<ControllerFactory['projects']> {
		return instrumentedController(
			'projects',
			new Projects(new WorkspaceCommandRulesService(), this.dependencies.projects),
			controllerSurfaces.projects
		);
	}
	notes(): ReturnType<ControllerFactory['notes']> {
		return instrumentedController(
			'notes',
			new Notes(
				new BacklinkPresentationService(),
				new ReferencePresentationService(),
				new WorkspaceCommandRulesService(),
				new ProvenancePresentationService(),
				this.dependencies.notes
			),
			controllerSurfaces.notes
		);
	}
	todos(): ReturnType<ControllerFactory['todos']> {
		return instrumentedController(
			'todos',
			new Todos(new WorkspaceCommandRulesService(), this.dependencies.todos),
			controllerSurfaces.todos
		);
	}
	relationships(): ReturnType<ControllerFactory['relationships']> {
		return instrumentedController(
			'relationships',
			new Relationships(new RelationshipCandidatesService(), this.dependencies.relationships),
			controllerSurfaces.relationships
		);
	}
	references(): ReturnType<ControllerFactory['references']> {
		return instrumentedController(
			'references',
			new References(this.dependencies.references),
			controllerSurfaces.references
		);
	}
	diagrams(): ReturnType<ControllerFactory['diagrams']> {
		return instrumentedController(
			'diagrams',
			new Diagrams(this.dependencies.diagrams),
			controllerSurfaces.diagrams
		);
	}
	diagramStudio(): ReturnType<ControllerFactory['diagramStudio']> {
		return instrumentedController(
			'diagramStudio',
			new DiagramStudio(new WorkspaceCommandRulesService(), this.dependencies.diagramStudio),
			controllerSurfaces.diagramStudio
		);
	}
	suggestions(): ReturnType<ControllerFactory['suggestions']> {
		return instrumentedController(
			'suggestions',
			new Suggestions(new ProvenancePresentationService(), this.dependencies.suggestions),
			controllerSurfaces.suggestions
		);
	}
	skills(): ReturnType<ControllerFactory['skills']> {
		return instrumentedController(
			'skills',
			new Skills(new WorkspaceCommandRulesService(), this.dependencies.skills),
			controllerSurfaces.skills
		);
	}
	agent(): ReturnType<ControllerFactory['agent']> {
		return instrumentedController(
			'agent',
			new Agent(new WorkspaceCommandRulesService(), this.dependencies.agent),
			controllerSurfaces.agent
		);
	}
	agentSettings(): ReturnType<ControllerFactory['agentSettings']> {
		return instrumentedController(
			'agentSettings',
			new AgentSettings(new WorkspaceCommandRulesService(), this.dependencies.agentSettings),
			controllerSurfaces.agentSettings
		);
	}
	userSettings(): ReturnType<ControllerFactory['userSettings']> {
		return instrumentedController(
			'userSettings',
			new UserSettings(new WorkspaceCommandRulesService(), this.dependencies.userSettings),
			controllerSurfaces.userSettings
		);
	}
	apiTokens(): ReturnType<ControllerFactory['apiTokens']> {
		return instrumentedController(
			'apiTokens',
			new ApiTokens(this.dependencies.apiTokens),
			controllerSurfaces.apiTokens
		);
	}
	toolPreferences(): ReturnType<ControllerFactory['toolPreferences']> {
		return instrumentedController(
			'toolPreferences',
			new ToolPreferences(new WorkspaceCommandRulesService(), this.dependencies.toolPreferences),
			controllerSurfaces.toolPreferences
		);
	}
	attachments(): ReturnType<ControllerFactory['attachments']> {
		return instrumentedController(
			'attachments',
			new Attachments(this.dependencies.attachments),
			controllerSurfaces.attachments
		);
	}
	deliverables(): ReturnType<ControllerFactory['deliverables']> {
		return instrumentedController(
			'deliverables',
			new Deliverables(new WorkspaceCommandRulesService(), this.dependencies.deliverables),
			controllerSurfaces.deliverables
		);
	}
	trustPolicies(): ReturnType<ControllerFactory['trustPolicies']> {
		return instrumentedController(
			'trustPolicies',
			new TrustPolicies(new WorkspaceCommandRulesService(), this.dependencies.trustPolicies),
			controllerSurfaces.trustPolicies
		);
	}
	memory(): ReturnType<ControllerFactory['memory']> {
		return instrumentedController(
			'memory',
			new Memory(new WorkspaceCommandRulesService(), this.dependencies.memory),
			controllerSurfaces.memory
		);
	}
	widgets(): ReturnType<ControllerFactory['widgets']> {
		return instrumentedController(
			'widgets',
			new Widgets(new WorkspaceCommandRulesService(), this.dependencies.widgets),
			controllerSurfaces.widgets
		);
	}
	retrieval(): ReturnType<ControllerFactory['retrieval']> {
		return instrumentedController(
			'retrieval',
			new Retrieval(this.dependencies.retrieval),
			controllerSurfaces.retrieval
		);
	}
	inlineSuggestions(): ReturnType<ControllerFactory['inlineSuggestions']> {
		return instrumentedController(
			'inlineSuggestions',
			new InlineSuggestions(this.dependencies.inlineSuggestions),
			controllerSurfaces.inlineSuggestions
		);
	}
	feedback(): ReturnType<ControllerFactory['feedback']> {
		return instrumentedController(
			'feedback',
			new Feedback(this.dependencies.feedback),
			controllerSurfaces.feedback
		);
	}
}
