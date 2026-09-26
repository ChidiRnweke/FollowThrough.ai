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
import type { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import type { AgentContext } from '$lib/server/services/agent/runs/context';
import type { NoteReader } from '$lib/server/services/notes/contracts';
import type { SkillFinder } from '$lib/server/services/skills/contracts';
import type { MemoryLibrary } from '$lib/server/services/memory/library';
import type { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import type {
	AgentModelCatalog,
	AgentPreferenceCatalog
} from '$lib/server/services/agent/runs/preferences';
import { resolveAgentModel } from '$lib/services/agent/model-selection';
import { AgentToolEventMapper } from '$lib/server/services/agent/runs/reasoning';
import { MermaidSubmissionValidator } from '$lib/server/services/diagrams/submission-validation';
import { DiagramGeneration } from '$lib/server/services/diagrams/generation';
import type { DiagramAgentDependencies } from '$lib/server/controllers/diagrams/controller';
import { DiagramContent } from '$lib/server/services/diagrams/content';
import {
	DrawioLabelReader,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { PresentedCanvasSource } from '$lib/server/services/diagrams/canvas-source';
import { IconifyIconSearch } from '$lib/server/services/diagrams/icons';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { traceWorkflow } from '$lib/server/services/telemetry';
import type { ProjectRepository } from '$lib/server/repositories/projects';

export interface DiagramsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenanceRepository: ProvenanceRepository;
	readonly provenance: ProvenanceRecorder;
	readonly context: AgentContext;
	readonly contextNotes: NoteReader;
	readonly contextSkills: Pick<SkillFinder, 'listEnabled'>;
	readonly contextMemory: Pick<MemoryLibrary, 'list'>;
	readonly conversations: ConversationArchive;
	readonly preferences: AgentPreferenceCatalog;
	readonly models: AgentModelCatalog;
	readonly runs: AgentRunLedger;
	readonly builtInSkills: BuiltInSkills;
	readonly defaultModel: string;
	readonly defaultVisionModel: string;
	readonly sessions: AgentSessionRepository;
	readonly projects: ProjectRepository;
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}

export interface DiagramsCapability {
	readonly library: DiagramLibrary;
	readonly transforms: DiagramContent;
	readonly generation: DiagramAgentDependencies;
	readonly suggestionValidator: DrawioXmlValidator;
	readonly xmlValidator: DrawioXmlValidator;
	readonly iconSearch: IconifyIconSearch;
	readonly canvasSource: PresentedCanvasSource;
	readonly svgSanitizer: DrawioSvgSanitizer;
	readonly labels: DrawioLabelReader;
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
	return {
		library,
		transforms: new DiagramContent(),
		suggestionValidator: new DrawioXmlValidator(),
		xmlValidator: new DrawioXmlValidator(),
		iconSearch: new IconifyIconSearch(),
		canvasSource: new PresentedCanvasSource(input.sessions),
		svgSanitizer: new DrawioSvgSanitizer(),
		labels: new DrawioLabelReader(),
		mermaidValidator: new MermaidSubmissionValidator(),
		now: () => new Date().toISOString() as DateTime,
		generation: {
			contextFormatter: input.context,
			contextNotes: input.contextNotes,
			contextSkills: input.contextSkills,
			contextMemory: input.contextMemory,
			conversations: input.conversations,
			preferences: input.preferences,
			models: input.models,
			runs: input.runs,
			runContext: new DiagramRunContext(new AgentRunRecords(input.db)),
			provenance: input.provenance,
			builtInSkills: input.builtInSkills,
			defaultModel: input.defaultModel,
			defaultVisionModel: input.defaultVisionModel,
			resolveModel: resolveAgentModel,
			createToolEventMapper: () => new AgentToolEventMapper(),
			observeWorkflow: traceWorkflow,
			generator: new DiagramGeneration(input)
		}
	};
};
