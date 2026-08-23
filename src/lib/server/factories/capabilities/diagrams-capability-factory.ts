import type { Database } from '$lib/server/db';
import type { DateTime } from '$lib/models/workspace';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import type { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import type { AgentContext } from '$lib/server/services/agent/runs/context';
import type { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import type {
	AgentModelCatalog,
	AgentPreferenceCatalog
} from '$lib/server/services/agent/runs/preferences';
import { resolveAgentModel } from '$lib/server/services/agent/runs/preferences';
import { AgentToolEventMapper } from '$lib/server/services/agent/runs/reasoning';
import {
	DiagramAuthoring,
	MermaidSubmissionValidator
} from '$lib/server/services/diagrams/authoring';
import { DiagramContent } from '$lib/server/services/diagrams/content';
import {
	DrawioDiagramTextExtractor,
	DrawioLabelExtractor,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { PresentedCanvasSource } from '$lib/server/services/diagrams/canvas-source';
import { IconifyIconSearch } from '$lib/server/services/diagrams/icons';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { DrawioReview } from '$lib/server/services/diagrams/review';
import { DrawioWrites } from '$lib/server/services/diagrams/drawio-writes';
import type { EmbeddedDiagramIndexer } from '$lib/server/services/knowledge-search/indexing';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { traceWorkflow } from '$lib/server/services/telemetry';
import type { ProjectReader } from '$lib/server/services/projects/contracts';

export interface DiagramsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenanceRepository: ProvenanceRepository;
	readonly provenance: ProvenanceRecorder;
	readonly context: AgentContext;
	readonly conversations: ConversationArchive;
	readonly preferences: AgentPreferenceCatalog;
	readonly models: AgentModelCatalog;
	readonly runs: AgentRunLedger;
	readonly builtInSkills: BuiltInSkills;
	readonly defaultModel: string;
	readonly defaultVisionModel: string;
	readonly indexer: EmbeddedDiagramIndexer;
	readonly sessions: AgentSessionRepository;
	readonly projects: ProjectReader;
}

export interface DiagramsCapability {
	readonly library: DiagramLibrary;
	readonly transforms: DiagramContent;
	readonly authoring: DiagramAuthoring;
	readonly review: DrawioReview;
	readonly drawioWrites: DrawioWrites;
	readonly suggestionValidator: DrawioXmlValidator;
	readonly suggestionLabels: DrawioLabelExtractor;
	readonly xmlValidator: DrawioXmlValidator;
	readonly iconSearch: IconifyIconSearch;
	readonly canvasSource: PresentedCanvasSource;
	readonly svgSanitizer: DrawioSvgSanitizer;
	readonly textExtractor: DrawioDiagramTextExtractor;
	readonly mermaidValidator: MermaidSubmissionValidator;
	/** One clock for every diagram write, services and controller alike. */
	readonly now: () => DateTime;
}

export const createDiagramsCapability = (input: DiagramsCapabilityInput): DiagramsCapability => {
	const library = new DiagramLibrary(
		new DiagramRecords(input.db),
		input.notes,
		input.anchors,
		input.provenanceRepository,
		input.projects
	);
	const drawioWrites = new DrawioWrites(
		library,
		new DrawioXmlValidator(),
		new DrawioSvgSanitizer(),
		new DrawioDiagramTextExtractor(),
		input.indexer
	);
	return {
		library,
		transforms: new DiagramContent(),
		suggestionValidator: new DrawioXmlValidator(),
		suggestionLabels: new DrawioLabelExtractor(),
		xmlValidator: new DrawioXmlValidator(),
		iconSearch: new IconifyIconSearch(),
		canvasSource: new PresentedCanvasSource(input.sessions),
		svgSanitizer: new DrawioSvgSanitizer(),
		textExtractor: new DrawioDiagramTextExtractor(),
		mermaidValidator: new MermaidSubmissionValidator(),
		now: () => new Date().toISOString() as DateTime,
		authoring: new DiagramAuthoring({
			contextBuilder: input.context,
			conversations: input.conversations,
			preferences: input.preferences,
			models: input.models,
			runs: input.runs,
			provenance: input.provenance,
			builtInSkills: input.builtInSkills,
			defaultModel: input.defaultModel,
			defaultVisionModel: input.defaultVisionModel,
			resolveModel: resolveAgentModel,
			createToolEventMapper: () => new AgentToolEventMapper(),
			observeWorkflow: traceWorkflow,
			drawioValidator: new DrawioXmlValidator()
		}),
		drawioWrites,
		review: new DrawioReview(
			library,
			new DrawioXmlValidator(),
			new DrawioSvgSanitizer(),
			new DrawioDiagramTextExtractor(),
			input.indexer
		)
	};
};
