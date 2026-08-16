import type { Database } from '$lib/server/db';
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
import { DiagramAuthoring } from '$lib/server/services/diagrams/authoring';
import { DiagramContent } from '$lib/server/services/diagrams/content';
import {
	DrawioDiagramTextExtractor,
	DrawioLabelExtractor,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { DrawioReview } from '$lib/server/services/diagrams/review';
import type { EmbeddedDiagramIndexer } from '$lib/server/services/knowledge-search/indexing';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { traceWorkflow } from '$lib/server/services/telemetry';

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
}

export interface DiagramsCapability {
	readonly library: DiagramLibrary;
	readonly transforms: DiagramContent;
	readonly authoring: DiagramAuthoring;
	readonly review: DrawioReview;
	readonly suggestionValidator: DrawioXmlValidator;
	readonly suggestionLabels: DrawioLabelExtractor;
	readonly xmlValidator: DrawioXmlValidator;
	readonly svgSanitizer: DrawioSvgSanitizer;
	readonly textExtractor: DrawioDiagramTextExtractor;
}

export const createDiagramsCapability = (input: DiagramsCapabilityInput): DiagramsCapability => {
	const library = new DiagramLibrary(
		new DiagramRecords(input.db),
		input.notes,
		input.anchors,
		input.provenanceRepository
	);
	return {
		library,
		transforms: new DiagramContent(),
		suggestionValidator: new DrawioXmlValidator(),
		suggestionLabels: new DrawioLabelExtractor(),
		xmlValidator: new DrawioXmlValidator(),
		svgSanitizer: new DrawioSvgSanitizer(),
		textExtractor: new DrawioDiagramTextExtractor(),
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
		review: new DrawioReview(
			library,
			new DrawioXmlValidator(),
			new DrawioSvgSanitizer(),
			new DrawioDiagramTextExtractor(),
			input.indexer
		)
	};
};
