import type { ActorContext } from '$lib/models/identity';
import { AgentStreamPresentationService } from '$lib/server/services/agent/runs/stream-presentation';
import {
	DiagramLabelPresentationService,
	type DiagramLabelPresentation
} from '$lib/services/diagrams/labels';
import { DiagramRuleService, type DiagramRules } from '$lib/services/diagrams/editing';
import {
	DiagramGenerationRuleService,
	type DiagramGenerationRules
} from '$lib/server/services/diagrams/generation-rules';
import { DiagramRunContext } from '$lib/server/services/diagrams/run-context';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import type { Database } from '$lib/server/db';
import type { DateTime } from '$lib/models/workspace';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import type {
	ConversationSessions,
	ConversationMessages
} from '$lib/server/services/agent/conversations/archive';
import type { IAgentContext } from '$lib/server/services/agent/runs/context';
import type { NoteReader } from '$lib/server/services/notes/catalog';

import type { SkillFinder } from '$lib/server/services/skills/library';
import type { MemoryEntryLister } from '$lib/server/services/memory/library';
import type { WorkflowRunLedger } from '$lib/server/services/agent/runs/ledger';
import type {
	AgentModelCatalog,
	AgentPreferenceEditor
} from '$lib/server/services/agent/runs/preferences';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';

import { createDiagramGeneration } from './diagram-generation-factory';
import type { DiagramAgentDependencies } from '$lib/server/controllers/diagrams/controller';
import {
	MermaidDocumentService,
	type MermaidDocuments
} from '$lib/server/services/diagrams/mermaid';
import { DrawioDocumentService, type DrawioDocuments } from '$lib/server/services/diagrams/drawio';
import {
	PresentedCanvasSource,
	type CanvasSourceReader
} from '$lib/server/services/diagrams/canvas-source';
import { IconifyIconSearch, type IconSearch } from '$lib/server/services/diagrams/icons';
import { DiagramLibraryService, type DiagramLibrary } from '$lib/server/services/diagrams/library';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { BuiltInSkillProvisioner } from '$lib/server/services/skills/built-ins';
import { traceWorkflow } from '$lib/server/infrastructure/telemetry/tracing';
import type { ProjectRepository } from '$lib/server/repositories/projects';

import { ToolActivityProjection } from '$lib/server/services/agent/conversations/tool-activity';
export interface DiagramsCapabilityInput {
	readonly db: Database;
	/** One clock for every diagram write, services and controller alike. */
	readonly now: () => DateTime;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenanceRepository: ProvenanceRepository;
	readonly provenance: ProvenanceRecorder;
	readonly context: IAgentContext;
	readonly contextNotes: NoteReader;
	readonly contextSkills: Pick<SkillFinder, 'listEnabled'>;
	readonly contextMemory: MemoryEntryLister;
	readonly conversations: Pick<ConversationSessions, 'createWorkflow'>;
	readonly conversationMessages: Pick<
		ConversationMessages,
		'recordUserPrompt' | 'recordAssistantText' | 'recordToolActivity'
	>;
	readonly preferences: AgentPreferenceEditor;
	readonly models: AgentModelCatalog;
	readonly runs: WorkflowRunLedger;
	readonly builtInSkills: BuiltInSkillProvisioner;
	readonly defaultModel: string;
	readonly defaultVisionModel: string;
	readonly sessions: AgentSessionRepository;
	readonly projects: ProjectRepository;
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}

export interface DiagramsCapability {
	readonly rules: DiagramRules;
	readonly diagrams: DiagramLibrary;
	readonly mermaid: MermaidDocuments;
	readonly drawio: DrawioDocuments;
	readonly generation: DiagramAgentDependencies;
	readonly iconSearch: IconSearch;
	readonly canvasSource: CanvasSourceReader;
	readonly labelPresentation: DiagramLabelPresentation;
	readonly generationRules: DiagramGenerationRules;
}

export const createDiagramsCapability = (
	actor: ActorContext,
	input: DiagramsCapabilityInput
): DiagramsCapability => {
	return {
		diagrams: new DiagramLibraryService(
			actor,
			new DiagramRecords(actor, input.db),
			input.notes,
			input.anchors,
			input.provenanceRepository,
			input.projects,
			input.now
		),
		rules: new DiagramRuleService(),
		mermaid: new MermaidDocumentService(),
		drawio: new DrawioDocumentService(),
		iconSearch: new IconifyIconSearch(globalThis.fetch),
		canvasSource: new PresentedCanvasSource(input.sessions),
		labelPresentation: new DiagramLabelPresentationService(),
		generationRules: new DiagramGenerationRuleService(),
		generation: {
			contextFormatter: input.context,
			contextNotes: input.contextNotes,
			contextSkills: input.contextSkills,
			contextMemory: input.contextMemory,
			conversations: input.conversations,
			conversationMessages: input.conversationMessages,
			toolActivity: new ToolActivityProjection(),
			preferences: input.preferences,
			models: input.models,
			runs: input.runs,
			runContext: new DiagramRunContext(new AgentRunRecords(actor, input.db)),
			provenance: input.provenance,
			builtInSkills: input.builtInSkills,
			defaultModel: input.defaultModel,
			defaultVisionModel: input.defaultVisionModel,
			modelSelection: new AgentModelSelectionService(),
			streamPresentation: new AgentStreamPresentationService(),
			observeWorkflow: traceWorkflow,
			generator: createDiagramGeneration(input)
		}
	};
};
