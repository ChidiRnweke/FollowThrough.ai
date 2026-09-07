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
import type {
	AgentExecutionMode,
	AgentRun,
	AgentToolContractMap,
	RunAgentInput,
	ToolClassification
} from '$lib/models/agent';
import {
	agentPayloadItems,
	isAgentPayloadObject,
	readAgentPayload,
	readAgentPayloadObject,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import type { NoteEtag, NoteId, NoteRevisionId, TextSelection } from '$lib/models/notes';
import type { TodoId } from '$lib/models/todos';
import type { SuggestionId } from '$lib/models/suggestions';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import type { ArtifactId, TemplateId } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import { NotFoundError, ValidationError } from '$lib/errors';
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
import { toolFailure } from '$lib/models/agent/tool-failure';
import {
	projectMemory,
	projectNoteRevision,
	projectNoteSummary,
	projectNoteView,
	projectNoteWrite,
	projectProject,
	projectSkillView,
	projectSuggestion,
	projectTodo,
	projectTodoWrite,
	projectUser,
	type MemoryProjection,
	type NoteRevisionProjection,
	type NoteViewProjection,
	type NoteWriteProjection,
	type ProjectProjection,
	type SkillViewProjection,
	type SuggestionProjection,
	type TodoProjection,
	type TodoWriteProjection,
	type UserProjection
} from '../../services/agent/runs/tool-views';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
import {
	FIRST_CLASS_TOOL_NAMES,
	FIRST_CLASS_TOOL_SET,
	TOOL_CATALOG,
	toolDescription,
	type ToolName
} from '$lib/models/agent/tool-catalog';
import { agentFileOf } from '$lib/server/services/agent-files/virtual-files';

export { FIRST_CLASS_TOOL_NAMES, FIRST_CLASS_TOOL_SET };

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
] as const satisfies readonly ToolName[];

/** Membership for callers holding a {@link ToolName}; see {@link FIRST_CLASS_TOOL_SET}. */
export const LOCKED_TOOL_SET: ReadonlySet<ToolName> = new Set<ToolName>(LOCKED_TOOL_NAMES);

/**
 * The user's resolved tool selection, already collapsed from the stored user
 * defaults and project overrides. It is a plain predicate because the registry
 * builds its definitions synchronously, so every caller resolves first.
 */
export interface ToolAccessPolicy {
	isEnabled(toolName: string): boolean;
}

interface CoveredAgentControllers {
	readonly agentFiles: AgentFilesController;
	readonly workspace: WorkspaceController;
	readonly projects: ProjectsController;
	readonly notes: NotesController;
	readonly todos: TodosController;
	readonly relationships: RelationshipsController;
	readonly references: ReferencesController;
	readonly diagrams: DiagramsController;
	readonly diagramStudio: DiagramStudioController;
	readonly suggestions: SuggestionsController;
	readonly skills: SkillsController;
	readonly trustPolicies: TrustPoliciesController;
	readonly toolPreferences: ToolPreferencesController;
	readonly agentSettings: AgentSettingsController;
	readonly apiTokens: ApiTokensController;
	readonly attachments: AttachmentsController;
	readonly deliverables: DeliverablesController;
	readonly memory: MemoryController;
	readonly retrieval: RetrievalController;
}

export type AgentToolCoverage = AgentToolContractMap<CoveredAgentControllers>;

/**
 * Why most of the studio's surface is not an agent tool: these are the user
 * saying what the project keeps, and the studio is where they say it.
 */
const STUDIO_GESTURE =
	'Keeping a diagram is the user saying it is worth keeping; the studio owns that gate.';

export const agentToolCoverage = {
	agentFiles: {
		ls: { kind: 'read', tools: ['ls'] },
		grep: { kind: 'read', tools: ['grep'] },
		sed: { kind: 'read', tools: ['sed'] }
	},
	workspace: {
		pullChanges: {
			kind: 'excluded',
			reason: 'Browser synchronization uses the account change journal.'
		},
		readResource: {
			kind: 'excluded',
			reason: 'Conditional resource reads are a browser persistence protocol.'
		},
		getShellContext: { kind: 'read', tools: ['get_workspace_context'] },
		getTodayView: { kind: 'read', tools: ['get_today_view'] }
	},
	projects: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: { kind: 'read', tools: ['list_projects'] },
		get: { kind: 'read', tools: ['get_project'] },
		create: { kind: 'mutation', tools: ['create_project'] },
		rename: { kind: 'mutation', tools: ['rename_project'] },
		archive: { kind: 'mutation', tools: ['archive_project'] },
		createFolder: { kind: 'mutation', tools: ['create_folder'] },
		move: { kind: 'mutation', tools: ['move_project_entry'] },
		setSectionNumberingDefault: {
			kind: 'excluded',
			reason: 'A viewing default for the editor; it changes nothing the agent can read.'
		}
	},
	notes: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		get: { kind: 'read', tools: ['get_note'] },
		listDocuments: {
			kind: 'excluded',
			reason: 'Request batching for the export dialog; the agent reads a note with get_note.'
		},
		create: { kind: 'mutation', tools: ['create_note'] },
		save: { kind: 'mutation', tools: ['save_note', 'edit_note', 'save_skill', 'edit_skill'] },

		publish: { kind: 'mutation', tools: ['publish_note'] },
		discardDraft: { kind: 'mutation', tools: ['discard_note_draft'] },

		searchText: {
			kind: 'excluded',
			reason: 'Global text search is a UI surface; the agent finds notes with search_knowledge.'
		},
		replaceText: {
			kind: 'excluded',
			reason: 'Bulk replace is a UI surface; the agent edits a note with edit_note.'
		},
		rename: { kind: 'mutation', tools: ['rename_note'] },
		archive: { kind: 'mutation', tools: ['archive_note'] },
		restore: { kind: 'mutation', tools: ['restore_note'] },
		listTrash: { kind: 'read', tools: ['list_trashed_notes'] },
		deleteForever: { kind: 'mutation', tools: ['delete_note_forever'] },
		emptyTrash: { kind: 'mutation', tools: ['empty_note_trash'] },
		listRevisions: { kind: 'read', tools: ['list_note_versions'] },
		getRevision: {
			kind: 'excluded',
			reason: 'Diff rendering detail; the agent reads note content with get_note.'
		},
		readRevision: {
			kind: 'excluded',
			reason: 'Published version bodies are mounted under the note versions directory for sed.'
		},
		compareRevisions: { kind: 'read', tools: ['diff_note_versions'] },
		restoreRevision: { kind: 'mutation', tools: ['restore_note_version'] },
		setSectionNumbering: {
			kind: 'excluded',
			reason: 'Section numbering is a visual editor preference; note content is unchanged.'
		}
	},
	todos: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: { kind: 'read', tools: ['list_todos'] },
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
		create: { kind: 'mutation', tools: ['create_todo', 'create_todos'] },
		update: { kind: 'mutation', tools: ['update_todo'] },
		remove: {
			kind: 'excluded',
			reason: 'Deleting todos stays a deliberate user action in the detail panel.'
		},
		extractPromises: { kind: 'proposal', tools: ['extract_promises'] },
		startExtractPromises: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	relationships: {
		suggestFromSelection: { kind: 'proposal', tools: ['relate_selection'] },
		startSuggestFromSelection: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	references: {
		suggestFromSelection: { kind: 'proposal', tools: ['find_references'] },
		startSuggestFromSelection: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	diagrams: {
		generateMermaid: {
			kind: 'excluded',
			reason:
				'Mermaid generation is the inline note editor flow; the agent presents a canvas diagram with create_diagram.'
		},
		reviseMermaid: { kind: 'mutation', tools: ['revise_mermaid_diagram'] },
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
		promote: { kind: 'proposal', tools: ['promote_diagram'] },
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
		createDiagram: { kind: 'mutation', tools: ['create_diagram'] },
		// A revision writes a working revision onto the diagram it names, so it asks
		// first. `read` would mean no prompt, which is how the agent came to change a
		// saved diagram with neither permission asked nor anything shown.
		editDiagram: { kind: 'mutation', tools: ['edit_diagram'] },
		readCanvasDiagram: { kind: 'read', tools: ['read_canvas_diagram'] },
		readProjectDiagram: { kind: 'read', tools: ['read_project_diagram'] },
		searchDiagramIcons: { kind: 'read', tools: ['search_icons'] },
		// Everything below is a user gesture. Keeping, renaming and deleting are the
		// user saying what the project holds; the studio and the gallery own those
		// gates, and the agent's part is to put a version on the canvas.
		archiveProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		restoreProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		listTrashedProjectDiagrams: {
			kind: 'excluded',
			reason:
				'The trash is a place the user looks, not a source the agent reads: a diagram in it has been taken out of the project on purpose.'
		},
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
		list: { kind: 'read', tools: ['list_suggestions'] },
		listPendingMemory: {
			kind: 'excluded',
			reason: 'Pending memory review is scoped to the notification and memory UI.'
		},
		acceptReviewed: { kind: 'mutation', tools: ['accept_suggestion'] },
		accept: {
			kind: 'excluded',
			reason:
				'Acceptance goes through acceptReviewed, which refuses a draw.io diagram that has no review to draw its preview.'
		},
		reject: { kind: 'mutation', tools: ['reject_suggestion'] },
		revert: { kind: 'mutation', tools: ['revert_suggestion'] }
	},
	skills: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: { kind: 'read', tools: ['list_skills'] },
		get: {
			kind: 'excluded',
			reason:
				'Skill reads go through load_skill; the controller method still serves the UI and the skill write tools.'
		},
		loadForAgent: { kind: 'read', tools: ['load_skill'] },
		create: { kind: 'mutation', tools: ['create_skill'] },
		createFromSelection: { kind: 'mutation', tools: ['create_skill_from_selection'] },
		listVersions: { kind: 'read', tools: ['list_skill_versions'] },
		restoreVersion: { kind: 'mutation', tools: ['restore_skill_version'] },
		update: { kind: 'mutation', tools: ['update_skill'] },
		serialize: { kind: 'excluded', reason: 'The full skill is available through load_skill.' },
		setPinned: { kind: 'mutation', tools: ['set_skill_pinned'] }
	},
	attachments: {
		initiate: { kind: 'excluded', reason: 'The agent cannot upload local user files.' },
		complete: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		completeForTodo: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		list: { kind: 'read', tools: ['list_attachments'] },
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
		listTemplates: { kind: 'read', tools: ['list_templates'] },
		deleteTemplate: {
			kind: 'excluded',
			reason: 'Template management is a deliberate user action.'
		},
		generateDocument: { kind: 'mutation', tools: ['export_document'] },
		generateBundle: {
			kind: 'excluded',
			reason:
				'A zip download URL is only useful to a browser; the agent generates documents one at a time.'
		},
		previewDocument: {
			kind: 'excluded',
			reason: 'Preview is an interactive UI flow; the agent generates documents directly.'
		},
		getExportSettings: { kind: 'read', tools: ['get_export_settings'] },
		updateExportSettings: { kind: 'mutation', tools: ['update_export_settings'] },
		listArtifacts: { kind: 'read', tools: ['list_artifacts'] },
		getArtifact: { kind: 'read', tools: ['get_artifact'] },
		downloadArtifact: { kind: 'read', tools: ['download_artifact'] },
		deleteArtifact: { kind: 'mutation', tools: ['delete_artifact'] },
		regenerateArtifact: { kind: 'mutation', tools: ['regenerate_artifact'] }
	},
	trustPolicies: {
		list: { kind: 'read', tools: ['list_trust_policies'] },
		update: { kind: 'mutation', tools: ['update_trust_policy'] }
	},
	toolPreferences: {
		list: { kind: 'read', tools: ['list_tool_preferences'] },
		setEnabled: { kind: 'mutation', tools: ['set_tool_enabled'] },
		clearOverride: {
			kind: 'excluded',
			reason:
				'Resetting a project override to the workspace default is a settings-page affordance; the agent turns a tool on or off outright.'
		}
	},
	memory: {
		list: { kind: 'read', tools: ['list_project_memory', 'list_user_memory'] },
		propose: { kind: 'proposal', tools: ['propose_memory_change'] },
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
		getPreferences: { kind: 'read', tools: ['get_agent_preferences'] },
		updatePreferences: { kind: 'mutation', tools: ['update_agent_preferences'] },
		listModels: { kind: 'read', tools: ['list_agent_models'] },
		resolveDefaults: {
			kind: 'excluded',
			reason:
				'The deployment fallback the composer names on screen; the agent already runs on a model resolved for it.'
		}
	},
	apiTokens: {
		list: { kind: 'read', tools: ['list_api_tokens'] },
		revoke: { kind: 'mutation', tools: ['revoke_api_token'] }
	},
	retrieval: {
		search: { kind: 'read', tools: ['search', 'search_note'] }
	}
} as const satisfies AgentToolCoverage;

/**
 * Every tool name some controller method claims a contract for.
 *
 * `agentToolCoverage` is `as const satisfies`, so each `tools` entry keeps its
 * literals and this union is real rather than a restatement of `ToolName`.
 */
type BoundToolName = {
	[Controller in keyof typeof agentToolCoverage]: {
		[
			Method in keyof (typeof agentToolCoverage)[Controller]
		]: (typeof agentToolCoverage)[Controller][Method] extends {
			readonly tools: readonly (infer Name)[];
		}
			? Name
			: never;
	}[keyof (typeof agentToolCoverage)[Controller]];
}[keyof typeof agentToolCoverage];

/**
 * Registry and catalog name each other exactly, proved by the compiler.
 *
 * This replaced two runtime specs. A catalog name nobody bound was a tool the
 * factory could describe and never build; a bound name the catalog did not
 * carry was a tool with no description, which `toolDescription` only discovered
 * when someone constructed it. Both are now `pnpm check` failures at the
 * declaration rather than assertions in a suite that has to be run first.
 *
 * What stays runtime, and why: a union cannot see a name bound by two different
 * controller methods, and the *constructed* definition set is a function of run
 * context — `agentOnlyDefinitions` builds the selection-bound tools only when a
 * selection is present, and `McpTools` composes a different pair — so no type
 * can hold it total. `agent-tool-factory.spec.ts` covers both.
 */
type _CoverageCoversCatalog = Total<Exclude<ToolName, BoundToolName>>;
type _CoverageNamesNothingElse = Total<Exclude<BoundToolName, ToolName>>;

const none = z.object({});
const dateTime = z.iso.datetime({ offset: true }).transform((value) => value as DateTime);
const optionalModelField = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
/**
 * The two bounds, read back out of the parsed object for the cross-field check.
 *
 * `temporal` is generic over the caller's shape, so zod infers the refinement's
 * argument as a union that includes `Record<string, never>` and no longer knows
 * the two keys this function itself just added. That is why the check used to
 * open with `value as { createdAfter?: string; createdBefore?: string }`, which
 * asserted a shape rather than reading one. A schema costs the same and is true.
 */
const createdBoundsSchema = z.object({
	createdAfter: z.string().optional(),
	createdBefore: z.string().optional()
});
const temporal = <T extends z.ZodRawShape>(shape: T) =>
	z
		.object({
			...shape,
			createdAfter: optionalModelField(dateTime).describe(
				'Inclusive artifact creation-time lower bound as an ISO 8601 timestamp. Set only when the user asks for a creation-time range; otherwise omit it.'
			),
			createdBefore: optionalModelField(dateTime).describe(
				'Inclusive artifact creation-time upper bound as an ISO 8601 timestamp. Set only when the user asks for a creation-time range; otherwise omit it.'
			)
		})
		.superRefine((value, context) => {
			const { createdAfter, createdBefore } = createdBoundsSchema.parse(value);
			if (createdAfter && createdBefore && Date.parse(createdAfter) > Date.parse(createdBefore))
				context.addIssue({
					code: 'custom',
					message: 'createdAfter must be before or equal to createdBefore'
				});
		});
const withinCreatedRange = (
	createdAt: string,
	range: { readonly createdAfter?: string; readonly createdBefore?: string }
): boolean =>
	(!range.createdAfter || createdAt >= range.createdAfter) &&
	(!range.createdBefore || createdAt <= range.createdBefore);
/**
 * A row is kept unless it carries a `createdAt` outside the range. The two
 * tests used to be inline object casts — `item as { createdAt?: unknown }`, then
 * `item as { createdAt: string }` — on a value whose type already said it was
 * JSON. Indexing an {@link AgentPayloadObject} answers with another
 * `AgentPayload`, so a plain `typeof` finishes the narrowing.
 */
const filterCreated = (
	value: AgentPayload,
	range: { createdAfter?: string; createdBefore?: string }
): AgentPayload => {
	const items = agentPayloadItems(value);
	if (items)
		return items
			.filter((item) => {
				if (!isAgentPayloadObject(item)) return true;
				const createdAt = item.createdAt;
				return typeof createdAt !== 'string' || withinCreatedRange(createdAt, range);
			})
			.map((item) => filterCreated(item, range));
	if (!isAgentPayloadObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, filterCreated(item, range)])
	);
};

const createdRange = (
	value: AgentPayloadObject
): { createdAfter?: string; createdBefore?: string } => {
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
	.describe('Exact project UUID returned by a FollowThrough tool; never pass a project name.')
	.transform((value) => value as ProjectId);
const noteId = z
	.string()
	.uuid()
	.transform((value) => value as NoteId)
	.describe(
		'Exact note UUID returned in a FollowThrough note id field; never pass a title or project id.'
	);
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
	// Two Luna runs independently dropped `newText` from the sixth substantive
	// replacement in one generated call. Keep each atomic patch small enough for
	// every replacement to remain structurally complete; callers can continue in
	// a later call after the first batch succeeds.
	edits: z.array(noteEdit).min(1).max(5)
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
	readonly name: ToolName;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
	readonly execute: (input: AgentPayloadObject) => Promise<AgentPayload>;
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
	readonly preflight?: (input: AgentPayloadObject) => Promise<boolean>;
}

type Definition = AgentToolDefinition;

/**
 * Parse the tool's own parameter schema and carry the result to the seam as the
 * wire type, so no interface below the factory sees an open-keyed record. The
 * provider hands every call's arguments down as already-JSON, and zod validates
 * them; a value that passes the schema but still fails the JSON representation
 * check is corruption this application produced itself, so it raises rather
 * than inventing a value.
 *
 * Optional fields the schema preprocesses to `undefined` — the tools' spelling
 * of "blank means omitted" — are dropped rather than carried, because the wire
 * type cannot represent them and the tool bodies read absence as absence. The
 * drop is top-level only, deliberately: every schema keeps its preprocessed
 * optionals flat (`optionalModelField` on the tool's own shape), so a nested
 * object never gains a `undefined` value the JSON check below would have to
 * refuse. A schema that nests one changes that contract and must move the drop
 * down with it.
 */
const parseArguments = (schema: z.ZodObject, input: unknown): AgentPayloadObject => {
	const parsed: unknown = schema.parse(input);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		throw new Error('Tool arguments must parse to an object');
	const withoutUndefined = Object.fromEntries(
		Object.entries(parsed).filter(([, value]) => value !== undefined)
	);
	const read = readAgentPayloadObject(withoutUndefined);
	if (read.kind === 'corrupt')
		throw new Error(`Tool arguments could not be represented as JSON: ${read.message}`);
	return read.value;
};

type ControllerResult<Method> = Method extends (...args: never[]) => Promise<infer Output>
	? Output
	: never;

interface AgentToolOutputMap {
	readonly ls: ControllerResult<AgentFilesController['ls']>;
	readonly grep: ControllerResult<AgentFilesController['grep']>;
	readonly sed: ControllerResult<AgentFilesController['sed']>;
	readonly search: ControllerResult<RetrievalController['search']>;
	readonly search_note: ControllerResult<RetrievalController['search']>;
	readonly get_workspace_context: {
		readonly user: UserProjection;
		readonly projects: readonly ProjectProjection[];
		readonly noteTree: readonly import('$lib/server/services/agent/runs/tool-views').NoteSummaryProjection[];
		readonly skills: ControllerResult<WorkspaceController['getShellContext']>['skills'];
		readonly pendingSuggestionCount: number;
	};
	readonly get_today_view: ControllerResult<WorkspaceController['getTodayView']>;
	readonly list_projects: { readonly projects: readonly ProjectProjection[] };
	readonly get_project: ControllerResult<ProjectsController['get']>;
	readonly create_project: ProjectProjection;
	readonly rename_project: ProjectProjection;
	readonly archive_project: ProjectProjection;
	readonly create_folder: NoteWriteProjection;
	readonly move_project_entry: ControllerResult<ProjectsController['move']>;
	readonly get_note: NoteViewProjection;
	readonly create_note: NoteWriteProjection;
	readonly save_note: NoteWriteProjection;
	readonly edit_note:
		| ToolFailure
		| (NoteWriteProjection & {
				readonly appliedEdits: number;
				readonly matchedTexts: readonly string[];
		  });
	readonly rename_note: NoteWriteProjection;
	readonly archive_note: NoteWriteProjection;
	readonly restore_note: NoteWriteProjection;
	readonly list_trashed_notes: ControllerResult<NotesController['listTrash']>;
	readonly delete_note_forever: ControllerResult<NotesController['deleteForever']>;
	readonly empty_note_trash: ControllerResult<NotesController['emptyTrash']>;
	readonly list_note_versions: ControllerResult<NotesController['listRevisions']>;
	readonly diff_note_versions: ControllerResult<NotesController['compareRevisions']>;
	readonly restore_note_version: NoteWriteProjection & { readonly etag: NoteEtag };
	readonly publish_note: NoteWriteProjection & { readonly etag: NoteEtag };
	readonly discard_note_draft: ControllerResult<NotesController['discardDraft']>;
	readonly list_todos: { readonly todos: readonly TodoProjection[] };
	readonly create_todo: TodoWriteProjection;
	readonly create_todos: { readonly todos: readonly TodoWriteProjection[] };
	readonly update_todo: TodoWriteProjection;
	readonly revise_mermaid_diagram: ControllerResult<DiagramsController['reviseMermaid']>;
	readonly search_icons: ControllerResult<DiagramStudioController['searchDiagramIcons']>;
	readonly read_project_diagram: {
		readonly id: DiagramId;
		readonly kind: 'mermaid' | 'drawio';
		readonly title?: string;
		readonly labels: string;
		readonly path: string;
	};
	readonly promote_diagram: ControllerResult<DiagramsController['promote']>;
	readonly list_suggestions: { readonly suggestions: readonly SuggestionProjection[] };
	readonly accept_suggestion: ControllerResult<SuggestionsController['acceptReviewed']>;
	readonly reject_suggestion: ControllerResult<SuggestionsController['reject']>;
	readonly revert_suggestion: ControllerResult<SuggestionsController['revert']>;
	readonly list_skills: ControllerResult<SkillsController['list']>;
	readonly save_skill:
		| ToolFailure
		| { readonly noteId: NoteId; readonly name: string; readonly currentRevision: number };
	readonly edit_skill:
		| ToolFailure
		| {
				readonly noteId: NoteId;
				readonly name: string;
				readonly currentRevision: number;
				readonly appliedEdits: number;
				readonly matchedTexts: readonly string[];
		  };
	readonly create_skill: ControllerResult<SkillsController['create']>;
	readonly list_skill_versions: { readonly revisions: readonly NoteRevisionProjection[] };
	readonly restore_skill_version: ControllerResult<SkillsController['restoreVersion']>;
	readonly update_skill: ControllerResult<SkillsController['update']>;
	readonly set_skill_pinned: {
		readonly noteId: NoteId;
		readonly projectId: ProjectId;
		readonly pinned: boolean;
	};
	readonly list_api_tokens: ControllerResult<ApiTokensController['list']>;
	readonly revoke_api_token: {
		readonly tokenId: ApiTokenId;
		readonly name: string;
		readonly revoked: true;
	};
	readonly list_attachments: ControllerResult<AttachmentsController['list']>;
	readonly list_project_memory: { readonly entries: readonly MemoryProjection[] };
	readonly list_user_memory: { readonly entries: readonly MemoryProjection[] };
	readonly propose_memory_change: ControllerResult<MemoryController['propose']>;
	readonly list_trust_policies: ControllerResult<TrustPoliciesController['list']>;
	readonly update_trust_policy: ControllerResult<TrustPoliciesController['update']>;
	readonly list_tool_preferences: ControllerResult<ToolPreferencesController['list']>;
	readonly set_tool_enabled: ControllerResult<ToolPreferencesController['setEnabled']>;
	readonly get_agent_preferences: ControllerResult<AgentSettingsController['getPreferences']>;
	readonly update_agent_preferences: ControllerResult<
		AgentSettingsController['updatePreferences']
	> & {
		readonly previous: ControllerResult<AgentSettingsController['getPreferences']>;
	};
	readonly list_agent_models: ControllerResult<AgentSettingsController['listModels']>;
	readonly export_document: ControllerResult<DeliverablesController['generateDocument']>;
	readonly list_artifacts: ControllerResult<DeliverablesController['listArtifacts']>;
	readonly list_templates: ControllerResult<DeliverablesController['listTemplates']>;
	readonly get_export_settings: ControllerResult<DeliverablesController['getExportSettings']>;
	readonly update_export_settings: ControllerResult<DeliverablesController['updateExportSettings']>;
	readonly get_artifact: NonNullable<ControllerResult<DeliverablesController['getArtifact']>>;
	readonly download_artifact: ControllerResult<DeliverablesController['downloadArtifact']>;
	readonly delete_artifact: {
		readonly artifactId: ArtifactId;
		readonly title: string;
		readonly deleted: true;
	};
	readonly regenerate_artifact: ControllerResult<DeliverablesController['regenerateArtifact']>;
	readonly extract_promises: ControllerResult<TodosController['extractPromises']> & {
		readonly sourceNoteId: NoteId;
	};
	readonly relate_selection: ControllerResult<RelationshipsController['suggestFromSelection']> & {
		readonly sourceNoteId: NoteId;
	};
	readonly find_references: ControllerResult<ReferencesController['suggestFromSelection']> & {
		readonly sourceNoteId: NoteId;
	};
	readonly create_skill_from_selection: ControllerResult<
		SkillsController['createFromSelection']
	> & { readonly sourceNoteId: NoteId };
	readonly load_skill: SkillViewProjection;
	readonly create_diagram: ControllerResult<DiagramStudioController['createDiagram']>;
	readonly edit_diagram: ControllerResult<DiagramStudioController['editDiagram']>;
	readonly read_canvas_diagram: ControllerResult<DiagramStudioController['readCanvasDiagram']>;
}

export type AgentToolOutput<Name extends ToolName> = AgentToolOutputMap[Name];

/**
 * Key totality against the catalog, in both directions.
 *
 * The map is an interface, so nothing held it total over {@link ToolName}: a
 * tool added to the catalog without an output entry stayed compilable until the
 * first `AgentToolOutput<'that_tool'>` needed it, and an entry left behind by a
 * deleted tool never failed at all. `agentToolCoverage` is checked structurally
 * because it is a mapped type; this map could not be one, because its entries
 * name concrete controller results rather than a uniform value.
 */
type Total<T extends never> = T;
type _OutputMapCoversCatalog = Total<Exclude<ToolName, keyof AgentToolOutputMap>>;
type _OutputMapNamesNothingElse = Total<Exclude<keyof AgentToolOutputMap, ToolName>>;

const defineTool = <Name extends ToolName, T extends z.ZodObject>(
	name: Name,
	description: string,
	classification: Definition['classification'],
	parameters: T,
	execute: (input: z.infer<T>) => Promise<AgentToolOutput<Name>>,
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
			const read = readAgentPayload(result);
			if (read.kind === 'corrupt')
				throw new Error(`Tool output could not be represented as JSON: ${read.message}`);
			return filterCreated(read.value, createdRange(parseArguments(parameters, input)));
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
 * Refuse a write that did not say which project, naming the ones it could mean.
 *
 * The services no longer answer a missing project by taking the first active one
 * or creating a "General" — neither was a decision anyone made. That leaves the
 * model with a fact it has to supply and no way to guess it, so the refusal
 * carries the candidates rather than only the word "required". A failure the
 * caller can act on is the whole difference between this and a schema rejection.
 */
const requireProject = async (
	factory: ControllerFactory,
	actor: ActorContext,
	chosen: ProjectId | undefined,
	action: string
): Promise<ProjectId> => {
	if (chosen) return chosen;
	const { projects } = await factory.projects().list(actor);
	if (!projects.length)
		throw new ValidationError(
			`projectId is required to ${action}, and this workspace has no projects yet. Call create_project first, then retry with its id.`
		);
	const candidates = projects.map((project) => `${project.name} (${project.id})`).join(', ');
	throw new ValidationError(
		`projectId is required to ${action}. Retry naming one of these projects: ${candidates}.`
	);
};

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
	// audit-allow: no-record-unknown — JSON Schema property nodes are an open dialect by specification and are passed verbatim to the SDK protocol.
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
		const selection = this.context.input.selection;
		return [
			...Object.values(sharedToolDefinitions(this.controllers, this.actor)),
			...Object.values(appToolDefinitions(this.controllers, this.actor, this.context)),
			...(selection
				? Object.values(
						selectionToolDefinitions(this.controllers, this.actor, selection, this.context.model)
					)
				: [])
		].filter(
			(definition) =>
				(!allowed || allowed.has(definition.classification)) &&
				(LOCKED_TOOL_SET.has(definition.name) || this.toolAccess.isEnabled(definition.name))
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
		// Keyed by `string`, not `ToolName`: the retriever ranks against stored
		// embeddings and answers with whatever names that store holds, so a lookup
		// is how a foreign name becomes a definition. The definition it finds
		// carries the narrow name; a miss is a miss.
		const byName = new Map<string, Definition>(
			definitions.map((definition) => [definition.name, definition])
		);
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
			.filter((definition) => !FIRST_CLASS_TOOL_SET.has(definition.name))
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

	/**
	 * The catalog tools the model can call on the next generation: the first-class
	 * set, plus whatever `search_tools` has already promoted in this conversation.
	 * It takes the same `alreadyPromoted` list as {@link agentTools} and answers
	 * about the same surface.
	 *
	 * Answered here because this is where the gate is decided. The caller used to
	 * read it back off the built SDK values by testing
	 * `typeof tool.isEnabled !== 'function'`, but `tool()` gives every tool an
	 * `isEnabled` function, so the test was always false and the answer was only
	 * ever the promoted tools — never the first-class ones. Tool recovery was
	 * therefore telling the model to discover `save_note`, which it already held.
	 *
	 * `search_tools` is offered too and is deliberately absent: it is built here
	 * rather than defined, so it has no catalog name to report.
	 */
	offeredToolNames(alreadyPromoted: readonly string[] = []): ToolName[] {
		const promoted = new Set(alreadyPromoted);
		return this.definitions()
			.filter(
				(definition) => FIRST_CLASS_TOOL_SET.has(definition.name) || promoted.has(definition.name)
			)
			.map((definition) => definition.name);
	}

	/** Static name + description catalog, used by the tool retriever. */
	catalog(): ToolDescriptor[] {
		return TOOL_CATALOG.filter(
			(entry) => LOCKED_TOOL_SET.has(entry.name) || this.toolAccess.isEnabled(entry.name)
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
						(await gate(parseArguments(definition.parameters, input)))
				: definition.classification === 'mutation' && this.mode === 'approval_required',
			// `failure` first, and always: `ConversationBuffer` recognises the envelope
			// by that prefix to decide which calls the model still needs to re-read.
			// `recovery` because a bare message left the model guessing — it re-sent
			// the same rejected document twice rather than inspecting what it sent.
			errorFunction: (_context, error) =>
				JSON.stringify(
					toolFailure(error instanceof Error ? error.message : String(error), {
						recovery:
							'Read the failure and fix the arguments before retrying. Retrying the same arguments will fail the same way.'
					})
				),
			execute: async (input, _runContext, details) => {
				const args = parseArguments(definition.parameters, input);
				// The id is passed through or omitted, never coerced. It was
				// `String(details?.toolCall?.callId ?? '')`, so a call the provider
				// sent no id for arrived as `''` — a value the lifecycle then used as
				// a map key, where a second id-less call overwrote the first.
				const callId = details?.toolCall?.callId;
				return this.toolExecutor.execute(
					{
						...(callId === undefined ? {} : { callId }),
						toolName: definition.name,
						arguments: args,
						classification: definition.classification
					},
					() => definition.execute(args)
				);
			}
		});
		return declaresNoFields(definition.parameters) ? withBlankInputTolerated(built) : built;
	}
}

/**
 * Every tool both surfaces build, keyed by name.
 *
 * Keyed rather than listed so the key set is a type. `BuiltToolName` unions the
 * keys of this and the three gated groups below, and two assertions hold that
 * union equal to `ToolName` — so a catalog tool nobody builds, and a builder for
 * a tool the catalog does not have, are both `pnpm check` failures. The set used
 * to be an array, which has no key type at all, and the only thing standing
 * behind it was one runtime spec exercising one configuration.
 */
const sharedToolDefinitions = (factory: ControllerFactory, actor: ActorContext) => {
	const define = defineTool;
	const retrieval = () => ({
		ls: define(
			'ls',
			toolDescription('ls'),
			'read',
			z.object({ path: z.string().min(1).optional() }),
			(input) => factory.agentFiles().ls(actor, input.path)
		),
		grep: define(
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
		sed: define(
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
		search: define(
			'search',
			toolDescription('search'),
			'read',
			temporal({
				query: z.string().min(1),
				projectId: optionalModelField(projectId).describe(
					'Exact project UUID returned by a FollowThrough tool; never pass a project name. Omit to search all projects.'
				)
			}),
			(input) =>
				factory.retrieval().search(actor, {
					query: input.query,
					...(input.projectId ? { projectId: input.projectId as ProjectId } : {}),
					...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
					...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
				})
		),
		search_note: define(
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
		get_workspace_context: define(
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
		get_today_view: define(
			'get_today_view',
			toolDescription('get_today_view'),
			'read',
			z.object({ today: localDate }),
			(input) => factory.workspace().getTodayView(actor, input)
		)
	});
	const projects = () => ({
		list_projects: define(
			'list_projects',
			toolDescription('list_projects'),
			'read',
			temporal({}),
			async () => ({
				projects: (await factory.projects().list(actor)).projects.map(projectProject)
			})
		),
		get_project: define(
			'get_project',
			toolDescription('get_project'),
			'read',
			z.object({ projectId: projectId }),
			(input) => factory.projects().get(actor, input)
		),
		create_project: define(
			'create_project',
			toolDescription('create_project'),
			'mutation',
			z.object({ name: z.string().min(1), description: z.string().optional() }),
			async (input) => projectProject((await factory.projects().create(actor, input)).project)
		),
		rename_project: define(
			'rename_project',
			toolDescription('rename_project'),
			'mutation',
			z.object({ projectId: projectId, name: z.string().min(1) }),
			async (input) => projectProject((await factory.projects().rename(actor, input)).project)
		),
		archive_project: define(
			'archive_project',
			toolDescription('archive_project'),
			'mutation',
			z.object({ projectId: projectId }),
			async (input) => projectProject((await factory.projects().archive(actor, input)).project)
		),
		create_folder: define(
			'create_folder',
			toolDescription('create_folder'),
			'mutation',
			z.object({ projectId: projectId, name: z.string().min(1), parentId: noteId.optional() }),
			// A folder is a note, so it takes the note write projection rather than shipping a
			// (necessarily empty) ProseMirror document with it.
			async (input) =>
				projectNoteWrite((await factory.projects().createFolder(actor, input)).folder)
		),
		move_project_entry: define(
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
	});
	const notes = () => ({
		get_note: define(
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
		create_note: define(
			'create_note',
			toolDescription('create_note'),
			'mutation',
			// Optional here and required in `CreateNoteInput` on purpose. The service
			// will not invent a project, and a bare schema rejection would tell the
			// model only that a field is missing — which is what left it guessing in
			// the first place. Accepting the absence lets the failure carry the
			// projects it can choose from, which is an adapter's job.
			z.object({
				title: z.string().min(1),
				projectId: projectId.optional(),
				parentId: noteId
					.optional()
					.describe(
						'Set only when the user asked for a specific existing folder. Copy that folder id from workspace context; otherwise omit this field. Never use a note id, project id, or invented id.'
					)
			}),
			async (input) => {
				const chosenProjectId = await requireProject(
					factory,
					actor,
					input.projectId,
					'create a note'
				);
				const created = await factory
					.notes()
					.create(actor, { ...input, projectId: chosenProjectId });
				return projectNoteWrite(created.note);
			}
		),
		save_note: define(
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
				return projectNoteWrite(saved.note);
			}
		),
		edit_note: define(
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
					return toolFailure('No edits were applied.', {
						problems: patched.failures.map(describeNotePatchFailure)
					});
				const content = noteContentFromMarkdown(patched.markdown);
				const saved = await factory.notes().save(actor, {
					note: { ...current.note, ...content }
				});
				return {
					...projectNoteWrite(saved.note),
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
		rename_note: define(
			'rename_note',
			toolDescription('rename_note'),
			'mutation',
			z.object({ noteId: noteId, title: z.string().min(1) }),
			async (input) => projectNoteWrite((await factory.notes().rename(actor, input)).note)
		),
		archive_note: define(
			'archive_note',
			toolDescription('archive_note'),
			'mutation',
			z.object({ noteId: noteId }),
			async (input) => projectNoteWrite((await factory.notes().archive(actor, input)).note)
		),
		restore_note: define(
			'restore_note',
			toolDescription('restore_note'),
			'mutation',
			z.object({ noteId: noteId }),
			async (input) => projectNoteWrite((await factory.notes().restore(actor, input)).note)
		),
		list_trashed_notes: define(
			'list_trashed_notes',
			toolDescription('list_trashed_notes'),
			'read',
			z.object({ projectId: projectId.optional() }),
			(input) => factory.notes().listTrash(actor, input)
		),
		delete_note_forever: define(
			'delete_note_forever',
			toolDescription('delete_note_forever'),
			'mutation',
			z.object({ noteId: noteId }),
			(input) => factory.notes().deleteForever(actor, input)
		),
		empty_note_trash: define(
			'empty_note_trash',
			toolDescription('empty_note_trash'),
			'mutation',
			z.object({ projectId: projectId.optional() }),
			(input) => factory.notes().emptyTrash(actor, input)
		),
		list_note_versions: define(
			'list_note_versions',
			toolDescription('list_note_versions'),
			'read',
			z.object({ noteId: noteId }),
			(input) => factory.notes().listRevisions(actor, input)
		),
		diff_note_versions: define(
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
		restore_note_version: define(
			'restore_note_version',
			toolDescription('restore_note_version'),
			'mutation',
			z.object({ noteId: noteId, revisionId: noteRevisionId }),
			async (input) => {
				// The etag survives the projection: publish_note takes it as an argument, and
				// restoring a version is the step most likely to be followed by publishing it.
				const restored = await factory.notes().restoreRevision(actor, input);
				return { ...projectNoteWrite(restored.note), etag: restored.etag };
			}
		),
		publish_note: define(
			'publish_note',
			toolDescription('publish_note'),
			'mutation',
			z.object({ noteId: noteId, baseEtag: noteEtag }),
			async (input) => {
				const published = await factory.notes().publish(actor, input);
				return { ...projectNoteWrite(published.note), etag: published.etag };
			}
		),
		discard_note_draft: define(
			'discard_note_draft',
			toolDescription('discard_note_draft'),
			'mutation',
			z.object({ noteId: noteId }),
			(input) => factory.notes().discardDraft(actor, input)
		)
	});
	const todos = () => ({
		list_todos: define(
			'list_todos',
			toolDescription('list_todos'),
			'read',
			temporal({
				projectId: optionalModelField(projectId),
				noteId: optionalModelField(noteId),
				status: optionalModelField(z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled'])),
				responsibility: optionalModelField(z.enum(['mine', 'waiting_on'])),
				dueBefore: optionalModelField(localDate)
			}),
			async (input) => ({
				todos: (await factory.todos().list(actor, input)).todos.map((view) =>
					projectTodo(view.todo)
				)
			})
		),
		create_todo: define(
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
			async (input) => projectTodoWrite((await factory.todos().create(actor, input)).todo)
		),
		create_todos: define(
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
					const result = await factory.todos().create(actor, {
						...fields,
						projectId: input.projectId,
						...(dueDate ? { dueDate } : {})
					});
					created.push(projectTodoWrite(result.todo));
				}
				return { todos: created };
			}
		),
		update_todo: define(
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
			// The controller also returns the whole `TodoView`, which the model never reads.
			async (input) => projectTodoWrite((await factory.todos().update(actor, input)).todo)
		)
	});
	const diagrams = () => ({
		revise_mermaid_diagram: define(
			'revise_mermaid_diagram',
			toolDescription('revise_mermaid_diagram'),
			'mutation',
			z.object({ diagramId: diagramId, instruction: z.string().min(1) }),
			(input) => factory.diagrams().reviseMermaid(actor, input)
		),
		search_icons: define(
			'search_icons',
			toolDescription('search_icons'),
			'read',
			z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(12).optional() }),
			(input) => factory.diagramStudio().searchDiagramIcons(actor, input)
		),
		read_project_diagram: define(
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
		promote_diagram: define(
			'promote_diagram',
			toolDescription('promote_diagram'),
			'proposal',
			z.object({ diagramId: diagramId }),
			(input) => factory.diagrams().promote(actor, input)
		)
	});
	const suggestions = () => ({
		list_suggestions: define(
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
		accept_suggestion: define(
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
		reject_suggestion: define(
			'reject_suggestion',
			toolDescription('reject_suggestion'),
			'mutation',
			z.object({ suggestionId: suggestionId }),
			(input) => factory.suggestions().reject(actor, input)
		),
		revert_suggestion: define(
			'revert_suggestion',
			toolDescription('revert_suggestion'),
			'mutation',
			z.object({ suggestionId: suggestionId }),
			(input) => factory.suggestions().revert(actor, input)
		)
	});
	const skills = () => ({
		list_skills: define('list_skills', toolDescription('list_skills'), 'read', temporal({}), () =>
			factory.skills().list(actor)
		),
		save_skill: define(
			'save_skill',
			toolDescription('save_skill'),
			'mutation',
			z.object({ noteId: noteId, markdown: z.string() }),
			async (input) => {
				const view = await factory.skills().get(actor, { noteId: input.noteId as NoteId });
				if (view.skill.note.kind !== 'skill')
					return toolFailure('save_skill only edits skill notes; this note is not a skill.');
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
		edit_skill: define(
			'edit_skill',
			toolDescription('edit_skill'),
			'mutation',
			noteEdits,
			async (input) => {
				const view = await factory.skills().get(actor, { noteId: input.noteId as NoteId });
				if (view.skill.note.kind !== 'skill')
					return toolFailure('edit_skill only edits skill notes; this note is not a skill.');
				const before = noteMarkdownFromContent(view.skill.note.document);
				const patched = applyNotePatch(before, input.edits);
				// A failure is returned rather than thrown so the occurrence counts and
				// nearest matches survive into the model's next attempt.
				if (!patched.ok)
					return toolFailure('No edits were applied.', {
						problems: patched.failures.map(describeNotePatchFailure)
					});
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
		create_skill: define(
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
			async (input) => {
				const chosenProjectId = await requireProject(
					factory,
					actor,
					input.projectId,
					'create a skill'
				);
				return factory.skills().create(actor, { ...input, projectId: chosenProjectId });
			}
		),
		list_skill_versions: define(
			'list_skill_versions',
			toolDescription('list_skill_versions'),
			'read',
			temporal({ noteId: noteId }),
			async (input) => {
				const revisions = await factory.skills().listVersions(actor, input);
				return { revisions: revisions.map(projectNoteRevision) };
			}
		),
		restore_skill_version: define(
			'restore_skill_version',
			toolDescription('restore_skill_version'),
			'mutation',
			z.object({ noteId: noteId, revision: z.number().int().positive() }),
			(input) => factory.skills().restoreVersion(actor, input)
		),
		update_skill: define(
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
		set_skill_pinned: define(
			'set_skill_pinned',
			toolDescription('set_skill_pinned'),
			'mutation',
			z.object({ noteId: noteId, projectId: projectId, pinned: z.boolean() }),
			async (input) => {
				await factory.skills().setPinned(actor, input);
				return input;
			}
		)
	});
	const account = () => ({
		list_api_tokens: define(
			'list_api_tokens',
			toolDescription('list_api_tokens'),
			'read',
			temporal({}),
			() => factory.apiTokens().list(actor)
		),
		revoke_api_token: define(
			'revoke_api_token',
			toolDescription('revoke_api_token'),
			'mutation',
			z.object({ tokenId: apiTokenId }),
			async (input) => {
				const token = await factory.apiTokens().revoke(actor, input.tokenId);
				return { tokenId: token.id, name: token.name, revoked: true as const };
			}
		),
		list_attachments: define(
			'list_attachments',
			toolDescription('list_attachments'),
			'read',
			temporal({ noteId: noteId }),
			(input) => factory.attachments().list(actor, input.noteId as NoteId)
		)
	});
	const memoryAndPreferences = () => ({
		list_project_memory: define(
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
		list_user_memory: define(
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
		propose_memory_change: define(
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
		list_trust_policies: define(
			'list_trust_policies',
			toolDescription('list_trust_policies'),
			'read',
			temporal({}),
			() => factory.trustPolicies().list(actor)
		),
		update_trust_policy: define(
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
		list_tool_preferences: define(
			'list_tool_preferences',
			toolDescription('list_tool_preferences'),
			'read',
			z.object({ projectId: projectId.optional() }),
			(input) =>
				factory
					.toolPreferences()
					.list(actor, input.projectId ? { projectId: input.projectId as ProjectId } : {})
		),
		set_tool_enabled: define(
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
		get_agent_preferences: define(
			'get_agent_preferences',
			toolDescription('get_agent_preferences'),
			'read',
			none,
			() => factory.agentSettings().getPreferences(actor)
		),
		update_agent_preferences: define(
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
		list_agent_models: define(
			'list_agent_models',
			toolDescription('list_agent_models'),
			'read',
			none,
			() => factory.agentSettings().listModels(actor)
		)
	});
	const deliverables = () => ({
		export_document: define(
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
		list_artifacts: define(
			'list_artifacts',
			toolDescription('list_artifacts'),
			'read',
			temporal({ projectId: projectId }),
			(input) => factory.deliverables().listArtifacts(actor, input.projectId)
		),
		list_templates: define(
			'list_templates',
			toolDescription('list_templates'),
			'read',
			temporal({ projectId: projectId }),
			(input) => factory.deliverables().listTemplates(actor, input.projectId)
		),
		get_export_settings: define(
			'get_export_settings',
			toolDescription('get_export_settings'),
			'read',
			z.object({ projectId: projectId }),
			(input) => factory.deliverables().getExportSettings(actor, input.projectId)
		),
		update_export_settings: define(
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
		get_artifact: define(
			'get_artifact',
			toolDescription('get_artifact'),
			'read',
			z.object({ artifactId: artifactId }),
			async (input) => {
				const artifact = await factory.deliverables().getArtifact(actor, input.artifactId);
				if (!artifact) throw new NotFoundError('Artifact not found');
				return artifact;
			}
		),
		download_artifact: define(
			'download_artifact',
			toolDescription('download_artifact'),
			'read',
			z.object({ artifactId: artifactId }),
			(input) => factory.deliverables().downloadArtifact(actor, input.artifactId)
		),
		delete_artifact: define(
			'delete_artifact',
			toolDescription('delete_artifact'),
			'mutation',
			z.object({ artifactId: artifactId }),
			async (input) => {
				const deleted = await factory.deliverables().deleteArtifact(actor, input.artifactId);
				return { artifactId: deleted.id, title: deleted.title, deleted: true as const };
			}
		),
		regenerate_artifact: define(
			'regenerate_artifact',
			toolDescription('regenerate_artifact'),
			'mutation',
			z.object({ artifactId: artifactId }),
			(input) => factory.deliverables().regenerateArtifact(actor, input.artifactId)
		)
	});
	return {
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
	};
};

/**
 * The tools that act *on* a selection, so a turn without one cannot build them.
 *
 * The selection is a parameter rather than something read off the context here,
 * which is what lets this group be total over its four names: the caller decides
 * whether there is a selection, and this decides nothing. The conditionality used
 * to live inside the group as `selection ? [...] : []`, which made the group's
 * membership — not just its availability — depend on the turn, and that is why no
 * type could hold the constructed set total.
 */
const selectionToolDefinitions = (
	factory: ControllerFactory,
	actor: ActorContext,
	selection: TextSelection,
	model: string
) => ({
	extract_promises: defineTool(
		'extract_promises',
		toolDescription('extract_promises'),
		'proposal',
		z.object({
			responsibility: z
				.enum(['mine', 'waiting_on'])
				.optional()
				.describe(
					'Use mine for commitments made by the user (I/my), waiting_on for commitments made by someone else, or omit only when the user asked for every actor.'
				)
		}),
		async (fields) => ({
			...(await factory.todos().extractPromises(actor, {
				selection,
				...(fields.responsibility ? { responsibility: fields.responsibility } : {})
			})),
			sourceNoteId: selection.noteId
		})
	),
	relate_selection: defineTool(
		'relate_selection',
		toolDescription('relate_selection'),
		'proposal',
		z.object({}),
		async () => ({
			...(await factory.relationships().suggestFromSelection(actor, { selection })),
			sourceNoteId: selection.noteId
		})
	),
	find_references: defineTool(
		'find_references',
		toolDescription('find_references'),
		'proposal',
		z.object({}),
		async () => ({
			...(await factory.references().suggestFromSelection(actor, { selection }, { model })),
			sourceNoteId: selection.noteId
		})
	),
	create_skill_from_selection: defineTool(
		'create_skill_from_selection',
		toolDescription('create_skill_from_selection'),
		'mutation',
		z.object({
			name: z.string().min(1),
			description: z.string(),
			triggerHints: z.array(z.string())
		}),
		async (fields) => ({
			...(await factory.skills().createFromSelection(actor, { ...fields, selection })),
			sourceNoteId: selection.noteId
		})
	)
});

/**
 * The tools only the in-app agent builds: `load_skill`, which threads the
 * conversation's own note as context, and the three studio tools whose whole
 * effect lands in a surface an external host does not have (`surface: 'app'` in
 * the catalog).
 */
const appToolDefinitions = (
	factory: ControllerFactory,
	actor: ActorContext,
	context: AgentToolContext
) => {
	const input = context.input;
	return {
		load_skill: defineTool(
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
		create_diagram: defineTool(
			'create_diagram',
			toolDescription('create_diagram'),
			'mutation',
			// `projectId` is optional here and required on `CreateDiagramInput`, for the
			// reason `create_note` is: a bare schema rejection would tell the model only
			// that a field is missing, and `requireProject` names the projects instead.
			z.object({
				source: z.string().min(1),
				title: z.string().min(1).optional(),
				projectId: projectId.optional()
			}),
			async (fields) => {
				const chosenProjectId = await requireProject(
					factory,
					actor,
					fields.projectId,
					'create a diagram'
				);
				return factory.diagramStudio().createDiagram(actor, {
					source: fields.source,
					projectId: chosenProjectId,
					conversationId: input.conversationId,
					...(fields.title === undefined ? {} : { title: fields.title })
				});
			}
		),
		edit_diagram: defineTool(
			'edit_diagram',
			toolDescription('edit_diagram'),
			'mutation',
			z.object({
				source: z.string().min(1),
				title: z.string().min(1).optional(),
				diagramId
			}),
			(fields) => factory.diagramStudio().editDiagram(actor, fields)
		),
		read_canvas_diagram: defineTool(
			'read_canvas_diagram',
			toolDescription('read_canvas_diagram'),
			'read',
			z.object({}),
			() =>
				factory.diagramStudio().readCanvasDiagram(actor, {
					conversationId: input.conversationId
				})
		)
	};
};

/**
 * `load_skill` is the one tool with a different body per surface: the in-app
 * agent threads the conversation's own note as `contextNoteId`, and an external
 * MCP host has no conversation to thread. It is therefore built here as well as
 * in {@link appToolDefinitions}, and is the only name the two groups share.
 */
const mcpOnlyDefinitions = (
	factory: ControllerFactory,
	actor: ActorContext,
	context: McpToolContext
) => ({
	load_skill: defineTool(
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
});

/**
 * Every tool name some group actually builds.
 *
 * This is the proof TN-34 could not make: the constructed set is now keyed, so
 * its membership is a type, and the two assertions below hold it equal to the
 * catalog in both directions. Availability is still a runtime question — a turn
 * without a selection builds no selection tools, an MCP host gets no app-surface
 * tools, and a deselected tool is filtered — but *which tools exist to be gated*
 * is now decided at compile time.
 */
type BuiltToolName =
	| keyof ReturnType<typeof sharedToolDefinitions>
	| keyof ReturnType<typeof selectionToolDefinitions>
	| keyof ReturnType<typeof appToolDefinitions>
	| keyof ReturnType<typeof mcpOnlyDefinitions>;

type _BuildersCoverCatalog = Total<Exclude<ToolName, BuiltToolName>>;
type _BuildersNameNothingElse = Total<Exclude<BuiltToolName, ToolName>>;

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
			...Object.values(sharedToolDefinitions(this.controllers, this.actor)),
			...Object.values(mcpOnlyDefinitions(this.controllers, this.actor, this.context))
		].filter(
			(definition) =>
				(!allowed || allowed.has(definition.classification)) &&
				(LOCKED_TOOL_SET.has(definition.name) || this.toolAccess.isEnabled(definition.name))
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
