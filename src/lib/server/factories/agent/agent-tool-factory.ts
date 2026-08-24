// chisel-ignore-file structural:factory-contains-logic -- Agent protocol adapter maps controller capabilities to SDK schemas; it makes no application-assembly decisions, and Chisel has no adapter layer.
import { tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import type { AgentSettingsController } from '$lib/server/controllers/agent/settings/controller';
import type { AgentFilesController } from '$lib/server/controllers/agent-files/controller';
import type { ToolPreferencesController } from '$lib/server/controllers/agent/tool-preferences/controller';
import type { TrustPoliciesController } from '$lib/server/controllers/agent/trust-policies/controller';
import type { ApiTokensController } from '$lib/server/controllers/api-tokens/controller';
import type { AttachmentsController } from '$lib/server/controllers/attachments/controller';
import type { DeliverablesController } from '$lib/server/controllers/deliverables/controller';
import type { DiagramsController } from '$lib/server/controllers/diagrams/controller';
import type { DiagramStudioController } from '$lib/server/controllers/diagram-studio/controller';
import type { RetrievalController } from '$lib/server/controllers/knowledge-search/controller';
import type { MemoryController } from '$lib/server/controllers/memory/controller';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import type { ProjectsController } from '$lib/server/controllers/projects/controller';
import type { ReferencesController } from '$lib/server/controllers/references/controller';
import type { RelationshipsController } from '$lib/server/controllers/relationships/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { SuggestionsController } from '$lib/server/controllers/suggestions/controller';
import type { TodosController } from '$lib/server/controllers/todos/controller';
import type { WorkspaceController } from '$lib/server/controllers/workspace/controller';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { ActorContext, ApiTokenId } from '$lib/models/identity';
import type { AgentExecutionMode, AgentRun, RunAgentInput } from '$lib/models/agent';
import type { NoteEtag, NoteId, NoteRevisionId } from '$lib/models/notes';
import type { TodoId } from '$lib/models/todos';
import type { SuggestionId } from '$lib/models/suggestions';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import type { ArtifactId, TemplateId } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import type { Confidence, ProvenanceId } from '$lib/models/provenance';
import type { DiagramId } from '$lib/models/diagrams';
import type { MemoryEntryId } from '$lib/models/memory';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import type {
	ToolDescriptor,
	ToolRetriever
} from '$lib/server/services/agent/tools/tool-retriever';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import { applyNotePatch, describeNotePatchFailure } from '$lib/models/notes';
import { webSearchEngines } from '$lib/models/agent';
import {
	projectMemory,
	projectNoteSummary,
	projectNoteView,
	projectProject,
	projectSkillView,
	projectSuggestion,
	projectTodo,
	projectUser
} from '../../services/agent/runs/tool-views';
import {
	FIRST_CLASS_TOOL_NAMES,
	TOOL_CATALOG,
	toolDescription
} from '$lib/models/agent/tool-catalog';
import { agentFileOf } from '$lib/server/services/agent-files/virtual-files';

export { FIRST_CLASS_TOOL_NAMES };

/**
 * Tools the user cannot deselect. Without `get_workspace_context` and
 * `load_skill` the agent loses its grounding and its instructions, and without
 * the two preference tools it could disable its own way back — a selection that
 * cannot be undone from the agent is a trap, not a setting.
 *
 * `search_tools` and `use_tool` need no entry: they are assembled in
 * `agentTools()` and in the MCP surface rather than being definitions, so no
 * preference can reach them.
 */
export const LOCKED_TOOL_NAMES = [
	'get_workspace_context',
	'load_skill',
	'list_tool_preferences',
	'set_tool_enabled'
];

/**
 * The user's resolved tool selection, already collapsed from the stored user
 * defaults and project overrides. It is a plain predicate because the registry
 * builds its definitions synchronously, so every caller resolves first.
 */
export interface ToolAccessPolicy {
	isEnabled(toolName: string): boolean;
}

export type AgentToolClassification =
	| { readonly kind: 'read' | 'proposal' | 'mutation' }
	| { readonly kind: 'excluded'; readonly reason: string };

type Coverage<T> = { readonly [Method in keyof T]: AgentToolClassification };

export interface AgentToolCoverage {
	readonly agentFiles: Coverage<AgentFilesController>;
	readonly workspace: Coverage<WorkspaceController>;
	readonly projects: Coverage<ProjectsController>;
	readonly notes: Coverage<NotesController>;
	readonly todos: Coverage<TodosController>;
	readonly relationships: Coverage<RelationshipsController>;
	readonly references: Coverage<ReferencesController>;
	readonly diagrams: Coverage<DiagramsController>;
	readonly diagramStudio: Coverage<DiagramStudioController>;
	readonly suggestions: Coverage<SuggestionsController>;
	readonly skills: Coverage<SkillsController>;
	readonly trustPolicies: Coverage<TrustPoliciesController>;
	readonly toolPreferences: Coverage<ToolPreferencesController>;
	readonly agentSettings: Coverage<AgentSettingsController>;
	readonly apiTokens: Coverage<ApiTokensController>;
	readonly attachments: Coverage<AttachmentsController>;
	readonly deliverables: Coverage<DeliverablesController>;
	readonly memory: Coverage<MemoryController>;
	readonly retrieval: Coverage<RetrievalController>;
}

/**
 * Why most of the studio's surface is not an agent tool: these are the user
 * saying what the project keeps, and the studio is where they say it.
 */
const STUDIO_GESTURE =
	'Keeping a diagram is the user saying it is worth keeping; the studio owns that gate.';

export const agentToolCoverage = {
	agentFiles: {
		ls: { kind: 'read' },
		grep: { kind: 'read' },
		sed: { kind: 'read' }
	},
	workspace: { getShellContext: { kind: 'read' }, getTodayView: { kind: 'read' } },
	projects: {
		list: { kind: 'read' },
		get: { kind: 'read' },
		create: { kind: 'mutation' },
		rename: { kind: 'mutation' },
		archive: { kind: 'mutation' },
		createFolder: { kind: 'mutation' },
		move: { kind: 'mutation' },
		setSectionNumberingDefault: {
			kind: 'excluded',
			reason: 'A viewing default for the editor; it changes nothing the agent can read.'
		}
	},
	notes: {
		get: { kind: 'read' },
		listDocuments: {
			kind: 'excluded',
			reason: 'Request batching for the export dialog; the agent reads a note with get_note.'
		},
		create: { kind: 'mutation' },
		save: { kind: 'mutation' },
		sync: { kind: 'excluded', reason: 'ETag synchronization is a browser persistence protocol.' },
		publish: { kind: 'mutation' },
		discardDraft: { kind: 'mutation' },
		listSyncInventory: {
			kind: 'excluded',
			reason: 'Sync inventory is reserved for browser reconciliation.'
		},
		searchText: {
			kind: 'excluded',
			reason: 'Global text search is a UI surface; the agent finds notes with search_knowledge.'
		},
		replaceText: {
			kind: 'excluded',
			reason: 'Bulk replace is a UI surface; the agent edits a note with edit_note.'
		},
		rename: { kind: 'mutation' },
		archive: { kind: 'mutation' },
		restore: { kind: 'mutation' },
		listTrash: { kind: 'read' },
		deleteForever: { kind: 'mutation' },
		emptyTrash: { kind: 'mutation' },
		listRevisions: { kind: 'read' },
		getRevision: {
			kind: 'excluded',
			reason: 'Diff rendering detail; the agent reads note content with get_note.'
		},
		readRevision: {
			kind: 'excluded',
			reason: 'Published version bodies are mounted under the note versions directory for sed.'
		},
		compareRevisions: { kind: 'read' },
		restoreRevision: { kind: 'mutation' },
		setSectionNumbering: {
			kind: 'excluded',
			reason: 'Section numbering is a visual editor preference; note content is unchanged.'
		}
	},
	todos: {
		list: { kind: 'read' },
		get: {
			kind: 'excluded',
			reason: 'Reading one todo adds nothing over list, which already returns the same fields.'
		},
		count: {
			kind: 'excluded',
			reason: 'Counts serve the context bar; the agent reads todos through list.'
		},
		listCategories: {
			kind: 'excluded',
			reason: 'Category names serve the filter menu; the agent reads todos through list.'
		},
		exportBoardPdf: {
			kind: 'excluded',
			reason: 'Board export is a user download; the agent reads todos through list.'
		},
		create: { kind: 'mutation' },
		update: { kind: 'mutation' },
		remove: {
			kind: 'excluded',
			reason: 'Deleting todos stays a deliberate user action in the detail panel.'
		},
		extractPromises: { kind: 'proposal' },
		startExtractPromises: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	relationships: {
		suggestFromSelection: { kind: 'proposal' },
		startSuggestFromSelection: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	references: {
		suggestFromSelection: { kind: 'proposal' },
		startSuggestFromSelection: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	diagrams: {
		generateMermaid: { kind: 'proposal' },
		reviseMermaid: { kind: 'mutation' },
		reviseInlineMermaid: {
			kind: 'excluded',
			reason: 'Inline diagram revision is scoped to the editor workflow.'
		},
		convertInlineMermaid: {
			kind: 'excluded',
			reason: 'Inline draw.io conversion is scoped to the note editor review workflow.'
		},
		getDrawio: {
			kind: 'excluded',
			reason: 'The note-scoped draw.io editor loads its own diagram.'
		},
		saveDrawio: { kind: 'excluded', reason: 'The draw.io editor owns explicit saves.' },
		promote: { kind: 'proposal' },
		startGenerateMermaid: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		},
		startReviseInlineMermaid: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		},
		startConvertInlineMermaid: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	diagramStudio: {
		// `read` is about approval: it stores nothing, so it raises no prompt. How it
		// is *rendered* afterwards is a separate question, answered by the `proposal`
		// family in `tool-disclosure.ts`.
		presentDiagram: { kind: 'read' },
		// A revision writes a working revision onto the diagram it names, so it asks
		// first. `read` would mean no prompt, which is how the agent came to change a
		// saved diagram with neither permission asked nor anything shown.
		presentDiagramRevision: { kind: 'mutation' },
		readCanvasDiagram: { kind: 'read' },
		readProjectDiagram: { kind: 'read' },
		searchDiagramIcons: { kind: 'read' },
		// Everything below is a user gesture. Keeping, renaming and deleting are the
		// user saying what the project holds; the studio and the gallery own those
		// gates, and the agent's part is to put a version on the canvas.
		keepStudioDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		findConversationDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		renameProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		saveProjectDiagramDraft: { kind: 'excluded', reason: STUDIO_GESTURE },
		publishProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		listDiagramRevisions: { kind: 'excluded', reason: STUDIO_GESTURE },
		getDiagramRevision: { kind: 'excluded', reason: STUDIO_GESTURE },
		restoreDiagramRevision: { kind: 'excluded', reason: STUDIO_GESTURE },
		deleteProjectDiagram: {
			kind: 'excluded',
			reason: 'Deleting a diagram can break notes that render it; it stays a confirmed user action.'
		},
		saveProjectDrawio: {
			kind: 'excluded',
			reason: 'The studio canvas owns explicit saves; the agent does not drive the draw.io embed.'
		},
		countDiagramReferences: {
			kind: 'excluded',
			reason: 'The reference count exists to word the delete confirmation.'
		},
		getProjectDiagram: {
			kind: 'excluded',
			reason: 'The studio canvas loads its own diagram; agent source is mounted for sed.'
		},
		listProjectDiagrams: {
			kind: 'excluded',
			reason:
				'The project diagram gallery is a UI surface; the agent finds diagrams with search_knowledge.'
		},
		countProjectDiagrams: {
			kind: 'excluded',
			reason: 'The count exists to fill in a number on the project overview.'
		}
	},
	suggestions: {
		list: { kind: 'read' },
		listPendingMemory: {
			kind: 'excluded',
			reason: 'Pending memory review is scoped to the notification and memory UI.'
		},
		acceptReviewed: { kind: 'mutation' },
		accept: {
			kind: 'excluded',
			reason:
				'Acceptance goes through acceptReviewed, which refuses a draw.io diagram that has no review to draw its preview.'
		},
		reject: { kind: 'mutation' },
		revert: { kind: 'mutation' }
	},
	skills: {
		list: { kind: 'read' },
		get: {
			kind: 'excluded',
			reason:
				'Skill reads go through load_skill; the controller method still serves the UI and the skill write tools.'
		},
		loadForAgent: { kind: 'read' },
		create: { kind: 'mutation' },
		createFromSelection: { kind: 'mutation' },
		listVersions: { kind: 'read' },
		restoreVersion: { kind: 'mutation' },
		update: { kind: 'mutation' },
		serialize: { kind: 'excluded', reason: 'The full skill is available through load_skill.' },
		setPinned: { kind: 'mutation' }
	},
	attachments: {
		initiate: { kind: 'excluded', reason: 'The agent cannot upload local user files.' },
		complete: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		completeForTodo: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		list: { kind: 'read' },
		listForProject: {
			kind: 'excluded',
			reason: 'Project attachments enter agent context through semantic retrieval.'
		},
		listForTodo: {
			kind: 'excluded',
			reason:
				'Todo screenshots enter agent context through the description text and semantic retrieval.'
		},
		download: { kind: 'excluded', reason: 'Signed URLs are only returned to the user interface.' },
		downloadById: {
			kind: 'excluded',
			reason: 'Signed URLs are only returned to the user interface.'
		},
		retry: { kind: 'excluded', reason: 'Attachment processing is managed by the user.' },
		removeById: { kind: 'excluded', reason: 'Project attachments are managed by the user.' },
		read: {
			kind: 'excluded',
			reason: 'Extracted attachment text is mounted under the project attachments directory.'
		},
		remove: { kind: 'excluded', reason: 'Bundle resources are managed by the user.' }
	},
	deliverables: {
		initiateTemplateUpload: {
			kind: 'excluded',
			reason: 'The agent cannot upload local user files.'
		},
		completeTemplateUpload: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		listTemplates: { kind: 'read' },
		deleteTemplate: {
			kind: 'excluded',
			reason: 'Template management is a deliberate user action.'
		},
		generateDocument: { kind: 'mutation' },
		generateBundle: {
			kind: 'excluded',
			reason:
				'A zip download URL is only useful to a browser; the agent generates documents one at a time.'
		},
		previewDocument: {
			kind: 'excluded',
			reason: 'Preview is an interactive UI flow; the agent generates documents directly.'
		},
		getExportSettings: { kind: 'read' },
		updateExportSettings: { kind: 'mutation' },
		listArtifacts: { kind: 'read' },
		getArtifact: { kind: 'read' },
		downloadArtifact: { kind: 'read' },
		deleteArtifact: { kind: 'mutation' },
		regenerateArtifact: { kind: 'mutation' }
	},
	trustPolicies: { list: { kind: 'read' }, update: { kind: 'mutation' } },
	toolPreferences: {
		list: { kind: 'read' },
		setEnabled: { kind: 'mutation' },
		clearOverride: {
			kind: 'excluded',
			reason:
				'Resetting a project override to the workspace default is a settings-page affordance; the agent turns a tool on or off outright.'
		}
	},
	memory: {
		list: { kind: 'read' },
		propose: { kind: 'proposal' },
		create: {
			kind: 'excluded',
			reason: 'Memory changes must flow through propose_memory_change review.'
		},
		update: {
			kind: 'excluded',
			reason: 'Memory changes must flow through propose_memory_change review.'
		},
		remove: {
			kind: 'excluded',
			reason: 'Memory changes must flow through propose_memory_change review.'
		}
	},
	agentSettings: {
		getPreferences: { kind: 'read' },
		updatePreferences: { kind: 'mutation' },
		listModels: { kind: 'read' }
	},
	apiTokens: { list: { kind: 'read' }, revoke: { kind: 'mutation' } },
	retrieval: {
		search: { kind: 'read' }
	}
} as const satisfies AgentToolCoverage;

const none = z.object({});
const dateTime = z.iso.datetime({ offset: true }).transform((value) => value as DateTime);
const temporal = <T extends z.ZodRawShape>(shape: T) =>
	z
		.object({
			...shape,
			createdAfter: dateTime.optional(),
			createdBefore: dateTime.optional()
		})
		.superRefine((value, context) => {
			const range = value as { createdAfter?: string; createdBefore?: string };
			if (
				range.createdAfter &&
				range.createdBefore &&
				Date.parse(range.createdAfter) > Date.parse(range.createdBefore)
			)
				context.addIssue({
					code: 'custom',
					message: 'createdAfter must be before or equal to createdBefore'
				});
		});
const withinCreatedRange = <T extends { readonly createdAt: string }>(
	value: T,
	range: { readonly createdAfter?: string; readonly createdBefore?: string }
): boolean =>
	(!range.createdAfter || value.createdAt >= range.createdAfter) &&
	(!range.createdBefore || value.createdAt <= range.createdBefore);
const filterCreated = (
	value: unknown,
	range: { createdAfter?: string; createdBefore?: string }
): unknown => {
	if (Array.isArray(value))
		return value
			.filter(
				(item) =>
					typeof item !== 'object' ||
					item === null ||
					typeof (item as { createdAt?: unknown }).createdAt !== 'string' ||
					withinCreatedRange(item as { createdAt: string }, range)
			)
			.map((item) => filterCreated(item, range));
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, filterCreated(item, range)])
	);
};

const createdRange = (value: unknown): { createdAfter?: string; createdBefore?: string } => {
	if (typeof value !== 'object' || value === null) return {};
	const createdAfter = 'createdAfter' in value ? value.createdAfter : undefined;
	const createdBefore = 'createdBefore' in value ? value.createdBefore : undefined;
	return {
		...(typeof createdAfter === 'string' ? { createdAfter } : {}),
		...(typeof createdBefore === 'string' ? { createdBefore } : {})
	};
};
const id = z.string().uuid();
const projectId = z
	.string()
	.uuid()
	.transform((value) => value as ProjectId);
const noteId = z
	.string()
	.uuid()
	.transform((value) => value as NoteId);
const todoId = z
	.string()
	.uuid()
	.transform((value) => value as TodoId);
const diagramId = z
	.string()
	.uuid()
	.transform((value) => value as DiagramId);
const suggestionId = z
	.string()
	.uuid()
	.transform((value) => value as SuggestionId);
const apiTokenId = z
	.string()
	.uuid()
	.transform((value) => value as ApiTokenId);
const artifactId = z
	.string()
	.uuid()
	.transform((value) => value as ArtifactId);
const noteRevisionId = z
	.string()
	.uuid()
	.transform((value) => value as NoteRevisionId);
const noteEtag = z
	.string()
	.min(1)
	.transform((value) => value as NoteEtag);
const memoryEntryId = z
	.string()
	.uuid()
	.transform((value) => value as MemoryEntryId);
const confidence = z
	.number()
	.int()
	.min(0)
	.max(100)
	.describe('Optional integer percentage from 0 to 100; use 90, never 0.9.')
	.transform((value) => value as Confidence);
/** One anchored replacement in a note or skill body. */
const noteEdit = z.object({
	oldText: z.string().min(1),
	newText: z.string(),
	replaceAll: z.boolean().optional()
});
/** Shared by edit_note and edit_skill, so their preflight gates validate the same shape. */
const noteEdits = z.object({
	noteId: noteId,
	edits: z.array(noteEdit).min(1).max(20)
});
const localDate = z.iso.date().transform((value) => value as LocalDate);
export interface AgentToolContext {
	readonly provenanceId: ProvenanceId;
	readonly model: string;
	readonly input: RunAgentInput;
}

export interface McpToolContext {
	readonly provenanceId: ProvenanceId;
}

/**
 * A capability, independent of how it is presented to a model. `tools()` and
 * `agentTools()` wrap these for the in-app `@openai/agents` runner; the MCP
 * server (`$lib/server/mcp`) wraps the same values for external hosts.
 */
export interface AgentToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly classification: 'read' | 'proposal' | 'mutation';
	readonly parameters: z.ZodObject;
	readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
	/**
	 * Optional gate consulted by the approval boundary, never by the tool itself.
	 *
	 * When a mutation would otherwise be parked for approval in approval-required
	 * mode, preflight decides whether the call can even succeed before the run
	 * stops to ask the user. A call that is doomed — edit anchors that match
	 * nothing in the note, a body that cannot parse — must NOT park: parking
	 * costs a fresh trace, a replayed transcript and another billed turn, and
	 * hands the model back the same dead end after the user approves. So a
	 * preflight returning false sends the call straight to `execute`, which
	 * returns its structured failure inside the same turn for the model to
	 * recover from (re-read, re-anchor, or fall back to save_note).
	 *
	 * Rules for implementers:
	 * - It runs only when the boundary would otherwise engage: never in
	 *   auto-accept mode and never for read/proposal calls, so a rejected gate
	 *   costs no extra reads.
	 * - It must be dry — read and patch in memory, never write.
	 * - Keep it consistent with `execute`: same read, same serializer, same
	 *   patch, so the gate and the outcome cannot disagree.
	 */
	readonly preflight?: (input: Record<string, unknown>) => Promise<boolean>;
}

type Definition = AgentToolDefinition;

const defineTool = <T extends z.ZodObject>(
	name: string,
	description: string,
	classification: Definition['classification'],
	parameters: T,
	execute: (input: z.infer<T>) => Promise<unknown>,
	preflight?: (input: z.infer<T>) => Promise<boolean>
): Definition => {
	const strictParameters = parameters.strict();
	return {
		name,
		description,
		classification,
		parameters: strictParameters,
		...(preflight ? { preflight: async (input) => preflight(parameters.parse(input)) } : {}),
		execute: async (input) => {
			strictParameters.parse(input);
			const parsed = parameters.parse(input);
			const result = await execute(parsed);
			return filterCreated(result, createdRange(parsed));
		}
	};
};

/**
 * True when a tool asks the model for nothing at all — the server resolves the
 * actor and workspace from run context, so the only valid argument object is
 * `{}`.
 */
const declaresNoFields = (schema: z.ZodObject): boolean => Object.keys(schema.shape).length === 0;

/**
 * The Agents SDK uses a different Zod major, so it cannot consume this app's
 * Zod objects directly. Keep Zod as the execution validator and publish the
 * exact strict object schema Zod generates for the model-facing protocol.
 */
const jsonObjectSchema = (schema: z.ZodObject) => {
	const converted = z.toJSONSchema(schema, { io: 'input' });
	if (
		converted.type !== 'object' ||
		converted.additionalProperties !== false ||
		typeof converted.properties !== 'object' ||
		converted.properties === null
	)
		throw new Error('Tool parameters must convert to a strict object schema');
	const properties: Record<string, Record<string, unknown>> = {};
	for (const [name, property] of Object.entries(converted.properties)) {
		if (typeof property !== 'object' || property === null)
			throw new Error(`Tool parameter ${name} did not convert to an object schema`);
		properties[name] = property;
	}
	const required = Array.isArray(converted.required)
		? converted.required.filter((name): name is string => typeof name === 'string')
		: [];
	return {
		type: 'object' as const,
		properties,
		required,
		additionalProperties: false as const,
		...(converted.description ? { description: converted.description } : {})
	};
};

/**
 * The SDK parses a tool call's raw argument string with `JSON.parse` before our
 * handler runs, so a model that answers an argument-free tool with `""` — there
 * is nothing to fill in, after all — fails inside the SDK with
 * `InvalidToolInputError` and never reaches the tool. A production run spun
 * through thirteen consecutive workspace-grounding calls this way, growing the
 * prompt each time, and died on the token ceiling.
 *
 * Only a blank string on a tool that declares no fields is repaired, and only to
 * the `{}` the model meant. Malformed non-empty JSON still fails its normal
 * validation, and tools that take arguments are untouched.
 */
const withBlankInputTolerated = (built: Tool<unknown>): Tool<unknown> => {
	if (built.type !== 'function') return built;
	const invoke = built.invoke.bind(built);
	return {
		...built,
		invoke: (runContext, input, details) =>
			invoke(runContext, input.trim().length === 0 ? '{}' : input, details)
	};
};

export class AgentTools {
	private readonly controllers: ControllerFactory;
	private readonly actor: ActorContext;
	private readonly mode: AgentExecutionMode;
	private readonly context: AgentToolContext;
	private readonly toolExecutor: AgentToolExecutor;
	private readonly toolRetriever: ToolRetriever;
	private readonly toolAccess: ToolAccessPolicy;

	constructor(
		controllers: ControllerFactory,
		actor: ActorContext,
		mode: AgentExecutionMode,
		context: AgentToolContext,
		toolExecutor: AgentToolExecutor,
		toolRetriever: ToolRetriever,
		toolAccess: ToolAccessPolicy
	) {
		this.controllers = controllers;
		this.actor = actor;
		this.mode = mode;
		this.context = context;
		this.toolExecutor = toolExecutor;
		this.toolRetriever = toolRetriever;
		this.toolAccess = toolAccess;
	}

	tools(
		options: { classifications?: readonly Definition['classification'][] } = {}
	): Tool<unknown>[] {
		return this.definitions(options).map((definition) => this.buildTool(definition));
	}

	/**
	 * The raw capability list, for surfaces that do their own wrapping. The
	 * in-app agent uses `tools()`/`agentTools()`; MCP builds from these.
	 *
	 * This is the one place the user's tool selection is applied, so a deselected
	 * tool disappears from the in-app agent, from `search_tools` ranking, from
	 * `use_tool` dispatch and from the MCP surface at once — there is no path to
	 * a capability that does not come through here.
	 */
	definitions(
		options: { classifications?: readonly Definition['classification'][] } = {}
	): AgentToolDefinition[] {
		const allowed = options.classifications
			? new Set<Definition['classification']>(options.classifications)
			: undefined;
		return [
			...sharedToolDefinitions(this.controllers, this.actor),
			...agentOnlyDefinitions(this.controllers, this.actor, this.context)
		].filter(
			(definition) =>
				(!allowed || allowed.has(definition.classification)) &&
				(LOCKED_TOOL_NAMES.includes(definition.name) || this.toolAccess.isEnabled(definition.name))
		);
	}

	/**
	 * Context-reducing surface for the agent. Frequently used grounding tools are
	 * registered directly; `search_tools` discovers every long-tail capability and
	 * promotes it to a direct, flat-schema tool.
	 *
	 * `alreadyPromoted` re-enables tools an earlier turn in the same conversation
	 * discovered. Without it the promotion set is rebuilt empty on every user
	 * message while the model's own transcript still shows it calling those tools
	 * directly — so it repeats the call and gets `Tool not found`, which is exactly
	 * the production failure where a request was retried six times and the edit
	 * never landed.
	 */
	agentTools(alreadyPromoted: readonly string[] = []): Tool<unknown>[] {
		const definitions = this.definitions();
		const byName = new Map(definitions.map((definition) => [definition.name, definition]));
		const firstClass = new Set(FIRST_CLASS_TOOL_NAMES);
		const selected = FIRST_CLASS_TOOL_NAMES.map((name) => byName.get(name)).filter(
			(definition): definition is Definition => definition !== undefined
		);
		const direct = selected.map((definition) => this.buildTool(definition));

		// Every long-tail tool is registered with its real flat schema but gated
		// behind `isEnabled`. The SDK drops disabled function tools in
		// `Agent.getAllTools` before serializing the request, so a gated tool costs
		// no prompt tokens, and `isEnabled` is re-evaluated before every generation
		// — so a tool `search_tools` promotes is callable on the very next one.
		// That is what lets the whole catalog be directly callable without paying
		// for the whole catalog, and it is why there is no `use_tool` envelope here:
		// the envelope's free-form `payload` renders as a property-less JSON schema,
		// so the model was asked to fill a shape it had never been shown, and
		// several model families answered with an empty object forever.
		const promoted = new Set<string>(alreadyPromoted);
		const discoverable = definitions
			.filter((definition) => !firstClass.has(definition.name))
			.map((definition) =>
				this.buildTool(definition, { isEnabled: () => promoted.has(definition.name) })
			);

		const searchParameters = z
			.object({
				query: z.string().min(1),
				limit: z.number().int().min(1).max(15).optional()
			})
			.strict();
		const searchSchema = jsonObjectSchema(searchParameters);
		const searchTools = tool({
			name: 'search_tools',
			description:
				'Find more FollowThrough tools relevant to what you want to do, when the tool you need is not already available directly. Each match comes back with its exact input schema and becomes a direct tool from your next message onward: call it by its own name with its arguments as flat top-level fields, exactly as the schema describes. There is no wrapper tool and no nested payload.',
			parameters: searchSchema,
			strict: true,
			execute: async (input) => {
				const { query: toolQuery, limit } = searchParameters.parse(input);
				const ranked = await this.toolRetriever.retrieve(this.catalog(), toolQuery, limit ?? 5);
				return ranked
					.map((name) => byName.get(name))
					.filter((definition): definition is Definition => definition !== undefined)
					.map((definition) => {
						promoted.add(definition.name);
						return {
							name: definition.name,
							description: definition.description,
							classification: definition.classification,
							input_schema: z.toJSONSchema(definition.parameters, { io: 'input' }),
							callable_directly: true
						};
					});
			}
		});

		return [...direct, ...discoverable, searchTools];
	}

	/** Static name + description catalog, used by the tool retriever. */
	catalog(): ToolDescriptor[] {
		return TOOL_CATALOG.filter(
			(entry) => LOCKED_TOOL_NAMES.includes(entry.name) || this.toolAccess.isEnabled(entry.name)
		);
	}

	private buildTool(
		definition: Definition,
		options: { isEnabled?: () => boolean } = {}
	): Tool<unknown> {
		// Captured so the approval callback below can narrow it: property narrowing
		// does not survive into a nested closure.
		const gate = definition.preflight;
		const schema = jsonObjectSchema(definition.parameters);
		const built = tool({
			name: definition.name,
			description: definition.description,
			parameters: schema,
			strict: true,
			...(options.isEnabled ? { isEnabled: options.isEnabled } : {}),
			// The approval boundary consults the tool's preflight gate before parking:
			// a mutation that can only fail is not paused for the user — it executes
			// in-turn and returns its failure to the model instead. See
			// `AgentToolDefinition.preflight` for the rules implementers must follow.
			needsApproval: gate
				? async (_context, input) =>
						definition.classification === 'mutation' &&
						this.mode === 'approval_required' &&
						(await gate(definition.parameters.parse(input)))
				: definition.classification === 'mutation' && this.mode === 'approval_required',
			errorFunction: (_context, error) =>
				JSON.stringify({ failure: error instanceof Error ? error.message : String(error) }),
			execute: async (input, _runContext, details) => {
				const parsed = definition.parameters.parse(input);
				return this.toolExecutor.execute(
					{
						callId: String(details?.toolCall?.callId ?? ''),
						toolName: definition.name,
						arguments: parsed,
						classification: definition.classification
					},
					() => definition.execute(parsed)
				);
			}
		});
		return declaresNoFields(definition.parameters) ? withBlankInputTolerated(built) : built;
	}
}

const sharedToolDefinitions = (factory: ControllerFactory, actor: ActorContext): Definition[] => {
	const define = defineTool;
	const retrieval = (): Definition[] => [
		define(
			'ls',
			toolDescription('ls'),
			'read',
			z.object({ path: z.string().min(1).optional() }),
			(input) => factory.agentFiles().ls(actor, input.path)
		),
		define(
			'grep',
			toolDescription('grep'),
			'read',
			z.object({
				pattern: z.string(),
				path: z.string().min(1),
				fixed: z.boolean().optional(),
				ignoreCase: z.boolean().optional()
			}),
			(input) =>
				factory.agentFiles().grep(actor, {
					pattern: input.pattern,
					path: input.path,
					fixed: input.fixed ?? false,
					ignoreCase: input.ignoreCase ?? false
				})
		),
		define(
			'sed',
			toolDescription('sed'),
			'read',
			z.object({
				path: z.string().min(1),
				range: z.discriminatedUnion('kind', [
					z.object({
						kind: z.literal('lines'),
						startLine: z.number().int().positive(),
						endLine: z.number().int().positive()
					}),
					z.object({
						kind: z.literal('to_end'),
						startLine: z.number().int().positive()
					})
				])
			}),
			(input) => factory.agentFiles().sed(actor, input.path, input.range)
		),
		define(
			'search',
			toolDescription('search'),
			'read',
			temporal({ query: z.string().min(1), projectId: projectId.optional() }),
			(input) =>
				factory.retrieval().search(actor, {
					query: input.query,
					...(input.projectId ? { projectId: input.projectId as ProjectId } : {}),
					...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
					...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
				})
		),
		define(
			'search_note',
			toolDescription('search_note'),
			'read',
			temporal({ noteId: noteId, query: z.string().min(1) }),
			(input) =>
				factory.retrieval().search(actor, {
					query: input.query,
					noteId: input.noteId as NoteId,
					...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
					...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
				})
		),
		define(
			'get_workspace_context',
			toolDescription('get_workspace_context'),
			'read',
			none,
			async () => {
				const shell = await factory.workspace().getShellContext(actor);
				return {
					user: projectUser(shell.user),
					projects: shell.projects.map(projectProject),
					// Structure only — the agent calls get_note for content.
					noteTree: shell.noteTree.map(projectNoteSummary),
					skills: shell.skills,
					pendingSuggestionCount: shell.pendingSuggestionCount
				};
			}
		),
		define(
			'get_today_view',
			toolDescription('get_today_view'),
			'read',
			z.object({ today: localDate }),
			(input) => factory.workspace().getTodayView(actor, input)
		)
	];
	const projects = (): Definition[] => [
		define('list_projects', toolDescription('list_projects'), 'read', temporal({}), async () => ({
			projects: (await factory.projects().list(actor)).projects.map(projectProject)
		})),
		define(
			'get_project',
			toolDescription('get_project'),
			'read',
			z.object({ projectId: projectId }),
			(input) => factory.projects().get(actor, input)
		),
		define(
			'create_project',
			toolDescription('create_project'),
			'mutation',
			z.object({ name: z.string().min(1), description: z.string().optional() }),
			(input) => factory.projects().create(actor, input)
		),
		define(
			'rename_project',
			toolDescription('rename_project'),
			'mutation',
			z.object({ projectId: projectId, name: z.string().min(1) }),
			(input) => factory.projects().rename(actor, input)
		),
		define(
			'archive_project',
			toolDescription('archive_project'),
			'mutation',
			z.object({ projectId: projectId }),
			(input) => factory.projects().archive(actor, input)
		),
		define(
			'create_folder',
			toolDescription('create_folder'),
			'mutation',
			z.object({ projectId: projectId, name: z.string().min(1), parentId: noteId.optional() }),
			(input) => factory.projects().createFolder(actor, input)
		),
		define(
			'move_project_entry',
			toolDescription('move_project_entry'),
			'mutation',
			z.object({
				projectId: projectId,
				entryId: noteId,
				parentId: noteId.optional(),
				position: z.number().int().nonnegative()
			}),
			(input) => factory.projects().move(actor, input)
		)
	];
	const notes = (): Definition[] => [
		define(
			'get_note',
			toolDescription('get_note'),
			'read',
			z.object({ noteId: noteId }),
			async (input) => {
				const view = await factory.notes().get(actor, { noteId: input.noteId as NoteId });
				const path = `/projects/${view.note.projectId}/notes/${view.note.id}.md`;
				const markdown = noteMarkdownFromContent(view.note.document);
				return projectNoteView(view, agentFileOf(path, 'text/markdown', markdown).metadata);
			}
		),
		define(
			'create_note',
			toolDescription('create_note'),
			'mutation',
			z.object({
				title: z.string().min(1),
				projectId: projectId.optional(),
				parentId: noteId.optional()
			}),
			(input) => factory.notes().create(actor, input)
		),
		define(
			'save_note',
			toolDescription('save_note'),
			'mutation',
			z.object({
				noteId: noteId,
				markdown: z.string()
			}),
			async (input) => {
				const current = await factory.notes().get(actor, { noteId: input.noteId as NoteId });
				const content = noteContentFromMarkdown(input.markdown);
				const saved = await factory.notes().save(actor, {
					note: { ...current.note, ...content }
				});
				return {
					noteId: saved.note.id,
					title: saved.note.title,
					currentRevision: saved.note.currentRevision
				};
			}
		),
		define(
			'edit_note',
			toolDescription('edit_note'),
			'mutation',
			noteEdits,
			async (input) => {
				const current = await factory.notes().get(actor, { noteId: input.noteId as NoteId });
				const before = noteMarkdownFromContent(current.note.document);
				const patched = applyNotePatch(before, input.edits);
				// A failure is returned rather than thrown: thrown errors are stringified
				// into a bare message, which would strip the occurrence counts and nearest
				// matches the model needs to correct itself on the next turn.
				if (!patched.ok)
					return {
						failure: 'No edits were applied.',
						problems: patched.failures.map(describeNotePatchFailure),
						failures: patched.failures
					};
				const content = noteContentFromMarkdown(patched.markdown);
				const saved = await factory.notes().save(actor, {
					note: { ...current.note, ...content }
				});
				return {
					noteId: saved.note.id,
					title: saved.note.title,
					currentRevision: saved.note.currentRevision,
					appliedEdits: patched.appliedEdits,
					matchedTexts: patched.matchedTexts
				};
			},
			async (input) => {
				const parsed = noteEdits.safeParse(input);
				if (!parsed.success) return false;
				const current = await factory.notes().get(actor, {
					noteId: parsed.data.noteId as NoteId
				});
				return applyNotePatch(noteMarkdownFromContent(current.note.document), parsed.data.edits).ok;
			}
		),
		define(
			'rename_note',
			toolDescription('rename_note'),
			'mutation',
			z.object({ noteId: noteId, title: z.string().min(1) }),
			(input) => factory.notes().rename(actor, input)
		),
		define(
			'archive_note',
			toolDescription('archive_note'),
			'mutation',
			z.object({ noteId: noteId }),
			(input) => factory.notes().archive(actor, input)
		),
		define(
			'restore_note',
			toolDescription('restore_note'),
			'mutation',
			z.object({ noteId: noteId }),
			(input) => factory.notes().restore(actor, input)
		),
		define(
			'list_trashed_notes',
			toolDescription('list_trashed_notes'),
			'read',
			z.object({ projectId: projectId.optional() }),
			(input) => factory.notes().listTrash(actor, input)
		),
		define(
			'delete_note_forever',
			toolDescription('delete_note_forever'),
			'mutation',
			z.object({ noteId: noteId }),
			(input) => factory.notes().deleteForever(actor, input)
		),
		define(
			'empty_note_trash',
			toolDescription('empty_note_trash'),
			'mutation',
			z.object({ projectId: projectId.optional() }),
			(input) => factory.notes().emptyTrash(actor, input)
		),
		define(
			'list_note_versions',
			toolDescription('list_note_versions'),
			'read',
			z.object({ noteId: noteId }),
			(input) => factory.notes().listRevisions(actor, input)
		),
		define(
			'diff_note_versions',
			toolDescription('diff_note_versions'),
			'read',
			z.object({
				noteId: noteId,
				revisionId: noteRevisionId,
				againstRevisionId: noteRevisionId.optional()
			}),
			(input) => factory.notes().compareRevisions(actor, input)
		),
		define(
			'restore_note_version',
			toolDescription('restore_note_version'),
			'mutation',
			z.object({ noteId: noteId, revisionId: noteRevisionId }),
			(input) => factory.notes().restoreRevision(actor, input)
		),
		define(
			'publish_note',
			toolDescription('publish_note'),
			'mutation',
			z.object({ noteId: noteId, baseEtag: noteEtag }),
			(input) => factory.notes().publish(actor, input)
		),
		define(
			'discard_note_draft',
			toolDescription('discard_note_draft'),
			'mutation',
			z.object({ noteId: noteId }),
			(input) => factory.notes().discardDraft(actor, input)
		)
	];
	const todos = (): Definition[] => [
		define(
			'list_todos',
			toolDescription('list_todos'),
			'read',
			temporal({
				projectId: projectId.optional(),
				noteId: noteId.optional(),
				status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional(),
				responsibility: z.enum(['mine', 'waiting_on']).optional(),
				dueBefore: localDate.optional()
			}),
			async (input) => ({
				todos: (await factory.todos().list(actor, input)).todos.map((view) =>
					projectTodo(view.todo)
				)
			})
		),
		define(
			'create_todo',
			toolDescription('create_todo'),
			'mutation',
			z.object({
				projectId: projectId,
				title: z.string().min(1),
				description: z.string().optional(),
				responsibility: z.enum(['mine', 'waiting_on']),
				waitingOn: z.string().optional(),
				dueDate: localDate.optional()
			}),
			(input) => factory.todos().create(actor, input)
		),
		define(
			'create_todos',
			toolDescription('create_todos'),
			'mutation',
			z.object({
				projectId: projectId,
				todos: z
					.array(
						z.object({
							title: z.string().min(1),
							description: z.string().optional(),
							responsibility: z.enum(['mine', 'waiting_on']),
							waitingOn: z.string().optional(),
							dueDate: localDate.optional()
						})
					)
					.min(1)
					.max(20)
			}),
			async (input) => {
				const created = [];
				for (const todo of input.todos) {
					const { dueDate, ...fields } = todo;
					created.push(
						await factory.todos().create(actor, {
							...fields,
							projectId: input.projectId,
							...(dueDate ? { dueDate } : {})
						})
					);
				}
				return { todos: created };
			}
		),
		define(
			'update_todo',
			toolDescription('update_todo'),
			'mutation',
			z.object({
				todoId: todoId,
				title: z.string().optional(),
				description: z.string().nullable().optional(),
				dueDate: localDate.nullable().optional(),
				responsibility: z.enum(['mine', 'waiting_on']).optional(),
				waitingOn: z.string().nullable().optional(),
				linkedNoteId: noteId.nullable().optional(),
				status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
			}),
			(input) => factory.todos().update(actor, input)
		)
	];
	const diagrams = (): Definition[] => [
		define(
			'revise_mermaid_diagram',
			toolDescription('revise_mermaid_diagram'),
			'mutation',
			z.object({ diagramId: diagramId, instruction: z.string().min(1) }),
			(input) => factory.diagrams().reviseMermaid(actor, input)
		),
		define(
			'search_icons',
			toolDescription('search_icons'),
			'read',
			z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(12).optional() }),
			(input) => factory.diagramStudio().searchDiagramIcons(actor, input)
		),
		define(
			'read_project_diagram',
			toolDescription('read_project_diagram'),
			'read',
			z.object({ diagramId: diagramId }),
			async (input) => {
				const diagram = await factory.diagramStudio().readProjectDiagram(actor, input);
				return {
					id: diagram.id,
					kind: diagram.kind,
					...(diagram.title ? { title: diagram.title } : {}),
					labels: diagram.labels,
					path: `/projects/${diagram.projectId}/diagrams/${diagram.id}.${diagram.kind === 'mermaid' ? 'mmd' : 'drawio'}`
				};
			}
		),
		define(
			'promote_diagram',
			toolDescription('promote_diagram'),
			'proposal',
			z.object({ diagramId: diagramId }),
			(input) => factory.diagrams().promote(actor, input)
		)
	];
	const suggestions = (): Definition[] => [
		define(
			'list_suggestions',
			toolDescription('list_suggestions'),
			'read',
			temporal({ status: z.enum(['proposed', 'accepted', 'rejected', 'expired', 'reverted']) }),
			async (input) => ({
				suggestions: (await factory.suggestions().list(actor, input)).groups.flatMap((group) =>
					group.suggestions.map((view) => projectSuggestion(view.suggestion))
				)
			})
		),
		define(
			'accept_suggestion',
			toolDescription('accept_suggestion'),
			'mutation',
			z.object({ suggestionId: suggestionId }),
			// `acceptReviewed`, not `accept`: a draw.io diagram accepted without its
			// review has no preview and can never gain one, and that guard lives in
			// `acceptReviewed`. Bound to the raw `accept`, this tool was the one
			// caller in the system that could mint a preview-less diagram. For every
			// other kind of suggestion the two are the same call.
			(input) => factory.suggestions().acceptReviewed(actor, input)
		),
		define(
			'reject_suggestion',
			toolDescription('reject_suggestion'),
			'mutation',
			z.object({ suggestionId: suggestionId }),
			(input) => factory.suggestions().reject(actor, input)
		),
		define(
			'revert_suggestion',
			toolDescription('revert_suggestion'),
			'mutation',
			z.object({ suggestionId: suggestionId }),
			(input) => factory.suggestions().revert(actor, input)
		)
	];
	const skills = (): Definition[] => [
		define('list_skills', toolDescription('list_skills'), 'read', temporal({}), () =>
			factory.skills().list(actor)
		),
		define(
			'save_skill',
			toolDescription('save_skill'),
			'mutation',
			z.object({ noteId: noteId, markdown: z.string() }),
			async (input) => {
				const view = await factory.skills().get(actor, { noteId: input.noteId as NoteId });
				if (view.skill.note.kind !== 'skill')
					return { failure: 'save_skill only edits skill notes; this note is not a skill.' };
				const content = noteContentFromMarkdown(input.markdown);
				const saved = await factory.notes().save(actor, {
					note: { ...view.skill.note, ...content }
				});
				return {
					noteId: saved.note.id,
					name: view.skill.name,
					currentRevision: saved.note.currentRevision
				};
			}
		),
		define(
			'edit_skill',
			toolDescription('edit_skill'),
			'mutation',
			noteEdits,
			async (input) => {
				const view = await factory.skills().get(actor, { noteId: input.noteId as NoteId });
				if (view.skill.note.kind !== 'skill')
					return { failure: 'edit_skill only edits skill notes; this note is not a skill.' };
				const before = noteMarkdownFromContent(view.skill.note.document);
				const patched = applyNotePatch(before, input.edits);
				// A failure is returned rather than thrown so the occurrence counts and
				// nearest matches survive into the model's next attempt.
				if (!patched.ok)
					return {
						failure: 'No edits were applied.',
						problems: patched.failures.map(describeNotePatchFailure),
						failures: patched.failures
					};
				const content = noteContentFromMarkdown(patched.markdown);
				const saved = await factory.notes().save(actor, {
					note: { ...view.skill.note, ...content }
				});
				return {
					noteId: saved.note.id,
					name: view.skill.name,
					currentRevision: saved.note.currentRevision,
					appliedEdits: patched.appliedEdits,
					matchedTexts: patched.matchedTexts
				};
			},
			async (input) => {
				const parsed = noteEdits.safeParse(input);
				if (!parsed.success) return false;
				const view = await factory.skills().get(actor, { noteId: parsed.data.noteId as NoteId });
				if (view.skill.note.kind !== 'skill') return false;
				return applyNotePatch(noteMarkdownFromContent(view.skill.note.document), parsed.data.edits)
					.ok;
			}
		),
		define(
			'create_skill',
			toolDescription('create_skill'),
			'mutation',
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
				triggerHints: z.array(z.string()).optional(),
				projectId: projectId.optional(),
				parentId: noteId.optional()
			}),
			(input) => factory.skills().create(actor, input)
		),
		define(
			'list_skill_versions',
			toolDescription('list_skill_versions'),
			'read',
			temporal({ noteId: noteId }),
			(input) => factory.skills().listVersions(actor, input)
		),
		define(
			'restore_skill_version',
			toolDescription('restore_skill_version'),
			'mutation',
			z.object({ noteId: noteId, revision: z.number().int().positive() }),
			(input) => factory.skills().restoreVersion(actor, input)
		),
		define(
			'update_skill',
			toolDescription('update_skill'),
			'mutation',
			z.object({
				noteId: noteId,
				displayName: z.string().min(1).optional(),
				description: z.string().optional(),
				triggerHints: z.array(z.string()).optional(),
				isEnabled: z.boolean().optional()
			}),
			(input) => factory.skills().update(actor, input)
		),
		define(
			'set_skill_pinned',
			toolDescription('set_skill_pinned'),
			'mutation',
			z.object({ noteId: noteId, projectId: projectId, pinned: z.boolean() }),
			(input) => factory.skills().setPinned(actor, input)
		)
	];
	const account = (): Definition[] => [
		define('list_api_tokens', toolDescription('list_api_tokens'), 'read', temporal({}), () =>
			factory.apiTokens().list(actor)
		),
		define(
			'revoke_api_token',
			toolDescription('revoke_api_token'),
			'mutation',
			z.object({ tokenId: apiTokenId }),
			(input) => factory.apiTokens().revoke(actor, input.tokenId)
		),
		define(
			'list_attachments',
			toolDescription('list_attachments'),
			'read',
			temporal({ noteId: noteId }),
			(input) => factory.attachments().list(actor, input.noteId as NoteId)
		)
	];
	const memoryAndPreferences = (): Definition[] => [
		define(
			'list_project_memory',
			toolDescription('list_project_memory'),
			'read',
			temporal({ projectId: projectId }),
			async (input) => ({
				entries: (
					await factory.memory().list(actor, {
						projectId: input.projectId as ProjectId,
						sharedOnly: true
					})
				).entries.map(projectMemory)
			})
		),
		define(
			'list_user_memory',
			toolDescription('list_user_memory'),
			'read',
			temporal({}),
			async () => {
				const entries = (await factory.memory().list(actor, { sharedOnly: true })).entries.map(
					projectMemory
				);
				return { entries };
			}
		),
		define(
			'propose_memory_change',
			toolDescription('propose_memory_change'),
			'proposal',
			z.object({
				scope: z.enum(['project', 'user']),
				projectId: projectId
					.optional()
					.describe('Required for project scope; omit entirely for user scope.'),
				operation: z.enum(['add', 'update', 'remove']),
				memoryEntryId: memoryEntryId
					.optional()
					.describe('Required for update or remove; omit entirely for add.'),
				content: z
					.string()
					.optional()
					.describe('Required for add or update; omit entirely for remove.'),
				justification: z.string().optional(),
				confidence: confidence
					.optional()
					.describe('Optional integer percentage from 0 to 100; use 90, never 0.9.')
			}),
			(input) => factory.memory().propose(actor, input)
		),
		define(
			'list_trust_policies',
			toolDescription('list_trust_policies'),
			'read',
			temporal({}),
			() => factory.trustPolicies().list(actor)
		),
		define(
			'update_trust_policy',
			toolDescription('update_trust_policy'),
			'mutation',
			z.object({
				pipeline: z.enum(['extract_promises', 'relate', 'reference', 'agent', 'memory']),
				autoAcceptEnabled: z.boolean(),
				minimumConfidence: confidence
					.optional()
					.describe('Optional integer percentage from 0 to 100; use 90, never 0.9.')
			}),
			(input) => factory.trustPolicies().update(actor, input)
		),
		define(
			'list_tool_preferences',
			toolDescription('list_tool_preferences'),
			'read',
			z.object({ projectId: projectId.optional() }),
			(input) =>
				factory
					.toolPreferences()
					.list(actor, input.projectId ? { projectId: input.projectId as ProjectId } : {})
		),
		define(
			'set_tool_enabled',
			toolDescription('set_tool_enabled'),
			'mutation',
			z.object({
				toolName: z.string().min(1),
				enabled: z.boolean(),
				projectId: projectId.optional()
			}),
			(input) =>
				factory.toolPreferences().setEnabled(actor, {
					toolName: input.toolName,
					enabled: input.enabled,
					...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
				})
		),
		define('get_agent_preferences', toolDescription('get_agent_preferences'), 'read', none, () =>
			factory.agentSettings().getPreferences(actor)
		),
		define(
			'update_agent_preferences',
			toolDescription('update_agent_preferences'),
			'mutation',
			z.object({
				defaultModel: z.string().nullable().optional(),
				defaultVisionModel: z.string().nullable().optional(),
				inlineModel: z.string().nullable().optional(),
				attachmentVisionModel: z.string().nullable().optional(),
				webSearchEngine: z.enum(webSearchEngines).nullable().optional(),
				webSearchMaxResults: z.number().int().min(1).max(50).nullable().optional(),
				webSearchMaxTotalResults: z.number().int().min(1).max(100).nullable().optional(),
				agentMaxTurns: z.number().int().min(1).max(50).nullable().optional(),
				executionMode: z.enum(['approval_required', 'auto_accept']).optional(),
				inlineSuggestionsEnabled: z.boolean().optional()
			}),
			/**
			 * The one write in the catalog that has to be asked for its own before-image.
			 * Every other mutating tool hands back the record whole, so the chat can show
			 * what a call did by reading the post-state against the arguments that set it —
			 * but a preference is a bare scalar, and "Default model: claude-opus-5" does not
			 * say whether that was a change or a restatement. Preferences are set rarely
			 * enough that one extra read costs nothing, and guessing the previous value
			 * client-side would mean reading it back *after* the write, which is the one
			 * moment it is guaranteed to be wrong.
			 */
			async (input) => {
				const previous = await factory.agentSettings().getPreferences(actor);
				const updated = await factory.agentSettings().updatePreferences(actor, input);
				return { ...updated, previous };
			}
		),
		define('list_agent_models', toolDescription('list_agent_models'), 'read', none, () =>
			factory.agentSettings().listModels(actor)
		)
	];
	const deliverables = (): Definition[] => [
		define(
			'export_document',
			toolDescription('export_document'),
			'mutation',
			z.object({
				projectId: projectId,
				noteIds: z.array(id),
				title: z.string().min(1),
				format: z.enum(['docx', 'pdf']),
				templateId: id.optional()
			}),
			(input) =>
				factory.deliverables().generateDocument(actor, {
					projectId: input.projectId as ProjectId,
					noteIds: input.noteIds.map((noteId) => noteId as NoteId),
					title: input.title,
					format: input.format,
					...(input.templateId ? { templateId: input.templateId as TemplateId } : {})
				})
		),
		define(
			'list_artifacts',
			toolDescription('list_artifacts'),
			'read',
			temporal({ projectId: projectId }),
			(input) => factory.deliverables().listArtifacts(actor, input.projectId)
		),
		define(
			'list_templates',
			toolDescription('list_templates'),
			'read',
			temporal({ projectId: projectId }),
			(input) => factory.deliverables().listTemplates(actor, input.projectId)
		),
		define(
			'get_export_settings',
			toolDescription('get_export_settings'),
			'read',
			z.object({ projectId: projectId }),
			(input) => factory.deliverables().getExportSettings(actor, input.projectId)
		),
		define(
			'update_export_settings',
			toolDescription('update_export_settings'),
			'mutation',
			z.object({
				projectId: projectId,
				fontFamily: z.enum(['helvetica', 'times', 'courier']),
				fontSize: z.number().min(8).max(18),
				lineHeight: z.number().min(1).max(2.2),
				margin: z.number().min(18).max(144),
				includeTitle: z.boolean().optional()
			}),
			(input) =>
				factory.deliverables().updateExportSettings(actor, input.projectId, {
					fontFamily: input.fontFamily,
					fontSize: input.fontSize,
					lineHeight: input.lineHeight,
					margin: input.margin,
					includeTitle: input.includeTitle
				})
		),
		define(
			'get_artifact',
			toolDescription('get_artifact'),
			'read',
			z.object({ artifactId: artifactId }),
			(input) => factory.deliverables().getArtifact(actor, input.artifactId)
		),
		define(
			'download_artifact',
			toolDescription('download_artifact'),
			'read',
			z.object({ artifactId: artifactId }),
			(input) => factory.deliverables().downloadArtifact(actor, input.artifactId)
		),
		define(
			'delete_artifact',
			toolDescription('delete_artifact'),
			'mutation',
			z.object({ artifactId: artifactId }),
			(input) => factory.deliverables().deleteArtifact(actor, input.artifactId)
		),
		define(
			'regenerate_artifact',
			toolDescription('regenerate_artifact'),
			'mutation',
			z.object({ artifactId: artifactId }),
			(input) => factory.deliverables().regenerateArtifact(actor, input.artifactId)
		)
	];
	return [
		...retrieval(),
		...projects(),
		...notes(),
		...todos(),
		...diagrams(),
		...suggestions(),
		...skills(),
		...account(),
		...memoryAndPreferences(),
		...deliverables()
	];
};

const agentOnlyDefinitions = (
	factory: ControllerFactory,
	actor: ActorContext,
	context: AgentToolContext
): Definition[] => {
	const input = context.input;
	const model = context.model;
	const selection = input.selection;
	const selectionDefinitions: Definition[] = selection
		? [
				defineTool(
					'extract_promises',
					toolDescription('extract_promises'),
					'proposal',
					z.object({}),
					() => factory.todos().extractPromises(actor, { selection })
				),
				defineTool(
					'relate_selection',
					toolDescription('relate_selection'),
					'proposal',
					z.object({}),
					() => factory.relationships().suggestFromSelection(actor, { selection })
				),
				defineTool(
					'find_references',
					toolDescription('find_references'),
					'proposal',
					z.object({}),
					() => factory.references().suggestFromSelection(actor, { selection }, { model })
				),
				defineTool(
					'generate_mermaid_diagram',
					toolDescription('generate_mermaid_diagram'),
					'proposal',
					z.object({ instruction: z.string().optional() }),
					(instruction) => factory.diagrams().generateMermaid(actor, { ...instruction, selection })
				),
				defineTool(
					'create_skill_from_selection',
					toolDescription('create_skill_from_selection'),
					'mutation',
					z.object({
						name: z.string().min(1),
						description: z.string(),
						triggerHints: z.array(z.string())
					}),
					(fields) => factory.skills().createFromSelection(actor, { ...fields, selection })
				)
			]
		: [];
	return [
		...selectionDefinitions,
		defineTool(
			'load_skill',
			toolDescription('load_skill'),
			'read',
			z.object({ noteId: noteId }),
			async (fields) => {
				const view = await factory.skills().loadForAgent(actor, {
					noteId: fields.noteId as NoteId,
					contextNoteId: input.noteId,
					provenanceId: context.provenanceId
				});
				return projectSkillView(view, noteMarkdownFromContent(view.skill.note.document));
			}
		),
		defineTool(
			'present_diagram',
			toolDescription('present_diagram'),
			'read',
			z.object({ source: z.string().min(1), title: z.string().min(1).optional() }),
			(fields) =>
				factory
					.diagramStudio()
					.presentDiagram(actor, { ...fields, conversationId: input.conversationId })
		),
		defineTool(
			'present_diagram_revision',
			toolDescription('present_diagram_revision'),
			'mutation',
			z.object({
				source: z.string().min(1),
				title: z.string().min(1).optional(),
				diagramId
			}),
			(fields) =>
				factory
					.diagramStudio()
					.presentDiagramRevision(actor, { ...fields, conversationId: input.conversationId })
		),
		defineTool(
			'read_canvas_diagram',
			toolDescription('read_canvas_diagram'),
			'read',
			z.object({}),
			() =>
				factory.diagramStudio().readCanvasDiagram(actor, {
					conversationId: input.conversationId
				})
		)
	];
};

const mcpOnlyDefinitions = (
	factory: ControllerFactory,
	actor: ActorContext,
	context: McpToolContext
): Definition[] => [
	defineTool(
		'load_skill',
		toolDescription('load_skill'),
		'read',
		z.object({ noteId: noteId }),
		async (fields) => {
			const view = await factory.skills().loadForAgent(actor, {
				noteId: fields.noteId as NoteId,
				provenanceId: context.provenanceId
			});
			return projectSkillView(view, noteMarkdownFromContent(view.skill.note.document));
		}
	)
];

export class McpTools {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly context: McpToolContext,
		private readonly toolAccess: ToolAccessPolicy
	) {}

	definitions(
		options: { classifications?: readonly Definition['classification'][] } = {}
	): AgentToolDefinition[] {
		const allowed = options.classifications
			? new Set<Definition['classification']>(options.classifications)
			: undefined;
		return [
			...sharedToolDefinitions(this.controllers, this.actor),
			...mcpOnlyDefinitions(this.controllers, this.actor, this.context)
		].filter(
			(definition) =>
				(!allowed || allowed.has(definition.classification)) &&
				(LOCKED_TOOL_NAMES.includes(definition.name) || this.toolAccess.isEnabled(definition.name))
		);
	}
}

export const agentToolRegistry =
	(controllers: () => ControllerFactory, toolRetriever: ToolRetriever) =>
	async ({
		actor,
		request,
		run,
		executor
	}: {
		actor: ActorContext;
		request: RunAgentInput;
		run: AgentRun;
		executor: AgentToolExecutor;
	}) => {
		const factory = controllers();
		const preferences = await factory
			.toolPreferences()
			.list(actor, request.projectId ? { projectId: request.projectId } : {});
		const disabled = new Set(
			preferences.filter((preference) => !preference.enabled).map((preference) => preference.name)
		);
		return new AgentTools(
			factory,
			actor,
			run.executionMode,
			{
				provenanceId: run.provenanceId as ProvenanceId,
				input: request,
				model: run.model
			},
			executor,
			toolRetriever,
			{ isEnabled: (toolName) => !disabled.has(toolName) }
		);
	};
