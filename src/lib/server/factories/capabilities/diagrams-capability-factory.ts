import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import {
	DiagramLabelPresentationService,
	type DiagramLabelPresentation
} from '$lib/services/diagrams/labels';
import { DiagramEditingService, type DiagramEditingRules } from '$lib/services/diagrams/editing';
import {
	DiagramLifecycleService as DiagramLifecycleRuleService,
	type DiagramLifecycleRules
} from '$lib/services/diagrams/trash';
import { IconifySearchPages } from '$lib/server/adapters/diagrams/iconify';
import {
	DiagramGenerationRuleService,
	type DiagramGenerationRules
} from '$lib/server/services/diagrams/generation-rules';
import { NodeMermaidSyntaxReader } from '$lib/server/adapters/diagrams/mermaid-parser';
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

import {
	MermaidSubmissionValidator,
	type MermaidSourceValidator
} from '$lib/server/services/diagrams/submission-validation';
import { createDiagramGeneration } from './diagram-generation-factory';
import type { DiagramAgentDependencies } from '$lib/server/controllers/diagrams/controller';
import {
	DiagramContent,
	type MermaidDiagramRenderer,
	type DiagramTextExtractor
} from '$lib/server/services/diagrams/content';
import {
	DrawioLabelReader,
	type DrawioLabels,
	type DrawioXmlContentValidator,
	type DrawioSvgPreviewSanitizer,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import {
	PresentedCanvasSource,
	type CanvasSourceReader
} from '$lib/server/services/diagrams/canvas-source';
import { IconifyIconSearch, type IconSearch } from '$lib/server/services/diagrams/icons';
import {
	DiagramReadingService,
	DiagramWritingService,
	DiagramLifecycleService,
	DiagramRevisionService,
	type DiagramFinder,
	type DiagramLister,
	type DiagramWriter,
	type DiagramDraftWriter,
	type DiagramRevisionReader,
	type DiagramLifecycle,
	type DiagramWriteReader,
	type DiagramConversationFinder,
	type DiagramReferenceCounter
} from '$lib/server/services/diagrams/library';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { BuiltInSkillProvisioner } from '$lib/server/services/skills/built-ins';
import { traceWorkflow } from '$lib/server/services/telemetry';
import type { ProjectRepository } from '$lib/server/repositories/projects';

export interface DiagramsCapabilityInput {
	readonly db: Database;
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
	readonly editingRules: DiagramEditingRules;
	readonly lifecycleRules: DiagramLifecycleRules;
	readonly services: DiagramServices;
	readonly renderer: MermaidDiagramRenderer;
	readonly textExtractor: DiagramTextExtractor;
	readonly generation: DiagramAgentDependencies;
	readonly xmlValidator: DrawioXmlContentValidator;
	readonly iconSearch: IconSearch;
	readonly canvasSource: CanvasSourceReader;
	readonly svgSanitizer: DrawioSvgPreviewSanitizer;
	readonly labels: DrawioLabels;
	readonly labelPresentation: DiagramLabelPresentation;
	readonly mermaidValidator: MermaidSourceValidator;
	readonly generationRules: DiagramGenerationRules;
	/** One clock for every diagram write, services and controller alike. */
	readonly now: () => DateTime;
}

export const createDiagramsCapability = (input: DiagramsCapabilityInput): DiagramsCapability => {
	const services = createDiagramServices(
		new DiagramRecords(input.db),
		input.notes,
		input.anchors,
		input.provenanceRepository,
		input.projects
	);
	return {
		services,
		editingRules: new DiagramEditingService(),
		lifecycleRules: new DiagramLifecycleRuleService(),
		renderer: new DiagramContent(),
		textExtractor: new DiagramContent(),
		xmlValidator: new DrawioXmlValidator(),
		iconSearch: new IconifyIconSearch(new IconifySearchPages()),
		canvasSource: new PresentedCanvasSource(input.sessions),
		svgSanitizer: new DrawioSvgSanitizer(),
		labels: new DrawioLabelReader(),
		labelPresentation: new DiagramLabelPresentationService(),
		mermaidValidator: new MermaidSubmissionValidator(new NodeMermaidSyntaxReader()),
		generationRules: new DiagramGenerationRuleService(),
		now: () => new Date().toISOString() as DateTime,
		generation: {
			contextFormatter: input.context,
			contextNotes: input.contextNotes,
			contextSkills: input.contextSkills,
			contextMemory: input.contextMemory,
			conversations: input.conversations,
			conversationMessages: input.conversationMessages,
			preferences: input.preferences,
			models: input.models,
			runs: input.runs,
			runContext: new DiagramRunContext(new AgentRunRecords(input.db)),
			provenance: input.provenance,
			builtInSkills: input.builtInSkills,
			defaultModel: input.defaultModel,
			defaultVisionModel: input.defaultVisionModel,
			modelSelection: new AgentModelSelectionService(),
			createToolEventMapper: () => createAgentStream().tools,
			observeWorkflow: traceWorkflow,
			generator: createDiagramGeneration(input)
		}
	};
};

export interface DiagramServices {
	readonly finder: DiagramFinder & DiagramWriteReader;
	readonly lister: DiagramLister;
	readonly conversations: DiagramConversationFinder;
	readonly references: DiagramReferenceCounter;
	readonly writer: DiagramWriter;
	readonly draftWriter: DiagramDraftWriter;
	readonly revisionReader: DiagramRevisionReader;
	readonly lifecycle: DiagramLifecycle;
}
export function createDiagramServices(
	diagrams: DiagramRepository,
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	provenance: ProvenanceRepository,
	projects: ProjectRepository
): DiagramServices {
	const reader = new DiagramReadingService(diagrams, notes);
	const revisions = new DiagramRevisionService(diagrams);
	return {
		finder: reader,
		lister: reader,
		conversations: reader,
		references: reader,
		writer: new DiagramWritingService(diagrams, notes, anchors, provenance, projects),
		draftWriter: revisions,
		revisionReader: revisions,
		lifecycle: new DiagramLifecycleService(diagrams)
	};
}
