import type { AttachmentProcessingController } from '$lib/server/controllers/attachment-processing/controller';
import type { KnowledgeIndexingController } from '$lib/server/controllers/knowledge-indexing/controller';
import type { ActorContext } from '$lib/models/identity';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { RelationshipCandidatesService } from '$lib/services/relationships/candidates';
import { controllerSurfaces } from './controller-surfaces';
import { AgentSdkHarness, type AgentHarnessDependencies } from '../controllers/agent/controller';
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
import {
	McpConnections,
	type McpConnectionsDependencies
} from '../controllers/mcp-connections/controller';
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
	ContextUsage,
	type ContextUsageDependencies
} from '../controllers/context-usage/controller';
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
import { Connectors, type ConnectorsDependencies } from '../controllers/connectors/controller';
import type { ControllerFactory } from './controller-factory';
import { instrumentedController } from './controller-instrumentation';
import type { ControllerSurface } from '$lib/models/controller-boundary';

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
	agentHarness: AgentHarnessDependencies;
	agentSettings: AgentSettingsDependencies;
	userSettings: UserSettingsDependencies;
	mcpConnections: McpConnectionsDependencies;
	toolPreferences: ToolPreferencesDependencies;
	attachments: AttachmentsDependencies;
	deliverables: DeliverablesDependencies;
	trustPolicies: TrustPoliciesDependencies;
	memory: MemoryDependencies;
	widgets: WidgetsDependencies;
	retrieval: RetrievalDependencies;
	inlineSuggestions: InlineSuggestionsDependencies;
	feedback: FeedbackDependencies;
	contextUsage: ContextUsageDependencies;
	attachmentProcessing: AttachmentProcessingController;
	knowledgeIndexing: KnowledgeIndexingController;
	connectors: ConnectorsDependencies;
}

export class ProductionControllerFactory implements ControllerFactory {
	constructor(
		private readonly actor: ActorContext,
		private readonly dependencies: ProductionControllerDependencies
	) {}
	// Every controller is wrapped at construction: one `domain.method` span and one completion
	// log line per call, naming this factory's user, for UI, MCP and agent-tool callers.
	private instrument<T extends object>(
		domain: string,
		controller: T,
		surface: ControllerSurface<T>
	): T {
		return instrumentedController(domain, controller, surface, {
			kind: 'actor',
			userId: this.actor.userId
		});
	}
	agentFiles(): ReturnType<ControllerFactory['agentFiles']> {
		return this.instrument(
			'agentFiles',
			new AgentFiles(this.dependencies.agentFiles),
			controllerSurfaces.agentFiles
		);
	}
	workspace(): ReturnType<ControllerFactory['workspace']> {
		return this.instrument(
			'workspace',
			new Workspace(new TodayPresentationService(), this.dependencies.workspace),
			controllerSurfaces.workspace
		);
	}
	projects(): ReturnType<ControllerFactory['projects']> {
		return this.instrument(
			'projects',
			new Projects(new WorkspaceCommandRulesService(), this.dependencies.projects),
			controllerSurfaces.projects
		);
	}
	notes(): ReturnType<ControllerFactory['notes']> {
		return this.instrument(
			'notes',
			new Notes(
				this.actor,
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
		return this.instrument(
			'todos',
			new Todos(this.actor, new WorkspaceCommandRulesService(), this.dependencies.todos),
			controllerSurfaces.todos
		);
	}
	relationships(): ReturnType<ControllerFactory['relationships']> {
		return this.instrument(
			'relationships',
			new Relationships(new RelationshipCandidatesService(), this.dependencies.relationships),
			controllerSurfaces.relationships
		);
	}
	references(): ReturnType<ControllerFactory['references']> {
		return this.instrument(
			'references',
			new References(this.dependencies.references),
			controllerSurfaces.references
		);
	}
	diagrams(): ReturnType<ControllerFactory['diagrams']> {
		return this.instrument(
			'diagrams',
			new Diagrams(this.actor, this.dependencies.diagrams),
			controllerSurfaces.diagrams
		);
	}
	diagramStudio(): ReturnType<ControllerFactory['diagramStudio']> {
		return this.instrument(
			'diagramStudio',
			new DiagramStudio(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.diagramStudio
			),
			controllerSurfaces.diagramStudio
		);
	}
	suggestions(): ReturnType<ControllerFactory['suggestions']> {
		return this.instrument(
			'suggestions',
			new Suggestions(
				this.actor,
				new ProvenancePresentationService(),
				this.dependencies.suggestions
			),
			controllerSurfaces.suggestions
		);
	}
	skills(): ReturnType<ControllerFactory['skills']> {
		return this.instrument(
			'skills',
			new Skills(new WorkspaceCommandRulesService(), this.dependencies.skills),
			controllerSurfaces.skills
		);
	}
	agentHarness(): ReturnType<ControllerFactory['agentHarness']> {
		return this.instrument(
			'agentHarness',
			new AgentSdkHarness(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.agentHarness
			),
			controllerSurfaces.agentHarness
		);
	}
	agentSettings(): ReturnType<ControllerFactory['agentSettings']> {
		return this.instrument(
			'agentSettings',
			new AgentSettings(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.agentSettings
			),
			controllerSurfaces.agentSettings
		);
	}
	userSettings(): ReturnType<ControllerFactory['userSettings']> {
		return this.instrument(
			'userSettings',
			new UserSettings(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.userSettings
			),
			controllerSurfaces.userSettings
		);
	}
	mcpConnections(): ReturnType<ControllerFactory['mcpConnections']> {
		return this.instrument(
			'mcpConnections',
			new McpConnections(this.dependencies.mcpConnections),
			controllerSurfaces.mcpConnections
		);
	}
	toolPreferences(): ReturnType<ControllerFactory['toolPreferences']> {
		return this.instrument(
			'toolPreferences',
			new ToolPreferences(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.toolPreferences
			),
			controllerSurfaces.toolPreferences
		);
	}
	attachments(): ReturnType<ControllerFactory['attachments']> {
		return this.instrument(
			'attachments',
			new Attachments(this.dependencies.attachments),
			controllerSurfaces.attachments
		);
	}
	deliverables(): ReturnType<ControllerFactory['deliverables']> {
		return this.instrument(
			'deliverables',
			new Deliverables(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.deliverables
			),
			controllerSurfaces.deliverables
		);
	}
	trustPolicies(): ReturnType<ControllerFactory['trustPolicies']> {
		return this.instrument(
			'trustPolicies',
			new TrustPolicies(
				this.actor,
				new WorkspaceCommandRulesService(),
				this.dependencies.trustPolicies
			),
			controllerSurfaces.trustPolicies
		);
	}
	memory(): ReturnType<ControllerFactory['memory']> {
		return this.instrument(
			'memory',
			new Memory(this.actor, new WorkspaceCommandRulesService(), this.dependencies.memory),
			controllerSurfaces.memory
		);
	}
	widgets(): ReturnType<ControllerFactory['widgets']> {
		return this.instrument(
			'widgets',
			new Widgets(this.actor, new WorkspaceCommandRulesService(), this.dependencies.widgets),
			controllerSurfaces.widgets
		);
	}
	retrieval(): ReturnType<ControllerFactory['retrieval']> {
		return this.instrument(
			'retrieval',
			new Retrieval(this.dependencies.retrieval),
			controllerSurfaces.retrieval
		);
	}
	inlineSuggestions(): ReturnType<ControllerFactory['inlineSuggestions']> {
		return this.instrument(
			'inlineSuggestions',
			new InlineSuggestions(this.actor, this.dependencies.inlineSuggestions),
			controllerSurfaces.inlineSuggestions
		);
	}
	feedback(): ReturnType<ControllerFactory['feedback']> {
		return this.instrument(
			'feedback',
			new Feedback(this.dependencies.feedback),
			controllerSurfaces.feedback
		);
	}
	contextUsage(): ReturnType<ControllerFactory['contextUsage']> {
		return this.instrument(
			'contextUsage',
			new ContextUsage(this.dependencies.contextUsage),
			controllerSurfaces.contextUsage
		);
	}
	attachmentProcessing(): ReturnType<ControllerFactory['attachmentProcessing']> {
		return this.instrument(
			'attachmentProcessing',
			this.dependencies.attachmentProcessing,
			controllerSurfaces.attachmentProcessing
		);
	}
	knowledgeIndexing(): ReturnType<ControllerFactory['knowledgeIndexing']> {
		return this.instrument(
			'knowledgeIndexing',
			this.dependencies.knowledgeIndexing,
			controllerSurfaces.knowledgeIndexing
		);
	}
	connectors(): ReturnType<ControllerFactory['connectors']> {
		return this.instrument(
			'connectors',
			new Connectors(this.dependencies.connectors),
			controllerSurfaces.connectors
		);
	}
}
