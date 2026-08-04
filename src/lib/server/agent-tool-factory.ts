// chisel-ignore-file structural:factory-contains-logic -- Agent protocol adapter maps controller capabilities to SDK schemas; it makes no application-assembly decisions, and Chisel has no adapter layer.
import { tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import type { AgentSettingsController } from '$lib/server/controllers/agent/settings/controller';
import type { ToolPreferencesController } from '$lib/server/controllers/agent/tool-preferences/controller';
import type { TrustPoliciesController } from '$lib/server/controllers/agent/trust-policies/controller';
import type { ApiTokensController } from '$lib/server/controllers/api-tokens/controller';
import type { AttachmentsController } from '$lib/server/controllers/attachments/controller';
import type { DeliverablesController } from '$lib/server/controllers/deliverables/controller';
import type { DiagramsController } from '$lib/server/controllers/diagrams/controller';
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
import type { ControllerFactory } from '$lib/server/controller-factory';
import type { ActorContext } from '$lib/models/identity';
import type { AgentExecutionMode, AgentRun, RunAgentInput } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
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
	createUseToolAttempts,
	invalidUseToolEnvelope,
	invalidUseToolPayload,
	resolveUseToolPayload,
	unknownUseToolName,
	useToolEnvelopeSchema
} from './services/agent/runs/tool-recovery';
import {
	projectMemory,
	projectNoteSummary,
	projectNoteView,
	projectProject,
	projectSkillView,
	projectSuggestion,
	projectTodo,
	projectUser
} from './services/agent/runs/tool-views';
import {
	FIRST_CLASS_TOOL_NAMES,
	TOOL_CATALOG,
	toolDescription
} from '$lib/models/agent/tool-catalog';

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
	readonly workspace: Coverage<WorkspaceController>;
	readonly projects: Coverage<ProjectsController>;
	readonly notes: Coverage<NotesController>;
	readonly todos: Coverage<TodosController>;
	readonly relationships: Coverage<RelationshipsController>;
	readonly references: Coverage<ReferencesController>;
	readonly diagrams: Coverage<DiagramsController>;
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

export const agentToolCoverage = {
	workspace: { getShellContext: { kind: 'read' }, getTodayView: { kind: 'read' } },
	projects: {
		list: { kind: 'read' },
		get: { kind: 'read' },
		create: { kind: 'mutation' },
		rename: { kind: 'mutation' },
		archive: { kind: 'mutation' },
		createFolder: { kind: 'mutation' },
		move: { kind: 'mutation' }
	},
	notes: {
		get: { kind: 'read' },
		create: { kind: 'mutation' },
		save: { kind: 'mutation' },
		sync: { kind: 'excluded', reason: 'ETag synchronization is a browser persistence protocol.' },
		publish: { kind: 'mutation' },
		discardDraft: { kind: 'mutation' },
		listSyncInventory: {
			kind: 'excluded',
			reason: 'Sync inventory is reserved for browser reconciliation.'
		},
		rename: { kind: 'mutation' },
		archive: { kind: 'mutation' }
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
		extractPromises: { kind: 'proposal' }
	},
	relationships: { suggestFromSelection: { kind: 'proposal' } },
	references: { suggestFromSelection: { kind: 'proposal' } },
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
		getDrawio: { kind: 'excluded', reason: 'The draw.io editor uses a note-scoped route.' },
		saveDrawio: { kind: 'excluded', reason: 'The draw.io editor owns explicit saves.' },
		promote: { kind: 'proposal' }
	},
	suggestions: {
		list: { kind: 'read' },
		listPendingMemory: {
			kind: 'excluded',
			reason: 'Pending memory review is scoped to the notification and memory UI.'
		},
		acceptReviewed: {
			kind: 'excluded',
			reason: 'Reviewed draw.io acceptance is scoped to the diagram review UI.'
		},
		accept: { kind: 'mutation' },
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
		read: { kind: 'read' },
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
const temporal = <T extends z.ZodRawShape>(shape: T) =>
	z
		.object({
			...shape,
			createdAfter: z.iso.datetime({ offset: true }).optional(),
			createdBefore: z.iso.datetime({ offset: true }).optional()
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
const id = z.string().uuid();
const selection = z.object({
	noteId: id,
	revision: z.number().int().positive(),
	from: z.number().int().nonnegative(),
	to: z.number().int().nonnegative(),
	text: z.string()
});
interface RegistryContext {
	readonly provenanceId: ProvenanceId;
	readonly input: RunAgentInput;
	readonly model: string;
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
}

type Definition = AgentToolDefinition;

const isInvalidToolInput = (
	error: unknown
): error is { readonly toolInvocation: Readonly<Record<string, unknown>> } =>
	typeof error === 'object' && error !== null && 'toolInvocation' in error;

export class AgentTools {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly mode: AgentExecutionMode,
		private readonly context: RegistryContext,
		private readonly toolExecutor?: AgentToolExecutor,
		private readonly toolRetriever?: ToolRetriever,
		private readonly toolAccess?: ToolAccessPolicy
	) {}

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
		return this.buildDefinitions().filter(
			(definition) =>
				(!allowed || allowed.has(definition.classification)) &&
				(LOCKED_TOOL_NAMES.includes(definition.name) ||
					!this.toolAccess ||
					this.toolAccess.isEnabled(definition.name))
		);
	}

	/**
	 * Context-reducing surface for the agent. Frequently used grounding tools are
	 * registered directly. `search_tools` discovers every long-tail capability and
	 * `use_tool` dispatches it by exact name.
	 */
	agentTools(): Tool<unknown>[] {
		const definitions = this.definitions();
		const byName = new Map(definitions.map((definition) => [definition.name, definition]));
		const names = definitions.map((definition) => definition.name);
		const firstClass = new Set(FIRST_CLASS_TOOL_NAMES);
		const selected = FIRST_CLASS_TOOL_NAMES.map((name) => byName.get(name)).filter(
			(definition): definition is Definition => definition !== undefined
		);
		const direct = selected.map((definition) => this.buildTool(definition));
		const attempts = createUseToolAttempts();

		// `use_tool` presents the tool's arguments as a free-form `payload` object,
		// which `z.toJSONSchema` renders with no properties at all — the model is
		// asked to fill a shape it was never shown, and several model families
		// answer with an empty object forever. So every long-tail tool is also
		// registered directly and gated behind `isEnabled`: once `search_tools`
		// surfaces one, the next turn sees it as an ordinary flat tool with named,
		// typed arguments, which is the shape models fill reliably. The SDK
		// re-evaluates `isEnabled` per turn, so nothing has to be rebuilt mid-run.
		const promoted = new Set<string>();
		const discoverable = definitions
			.filter((definition) => !firstClass.has(definition.name))
			.map((definition) =>
				this.buildTool(definition, { isEnabled: () => promoted.has(definition.name) })
			);

		const searchTools = tool({
			name: 'search_tools',
			description:
				'Find more FollowThrough tools relevant to what you want to do, when the tool you need is not already available directly. Each match comes back with its exact input schema, and becomes callable by its own name as a top-level tool from your next message onward — prefer calling it that way, with its arguments as flat top-level fields.',
			parameters: z.toJSONSchema(
				z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(15).optional() })
			) as never,
			strict: false,
			execute: async (input) => {
				const { query: toolQuery, limit } = input as { query: string; limit?: number };
				const ranked = this.toolRetriever
					? await this.toolRetriever.retrieve(this.catalog(), toolQuery, limit ?? 5)
					: [];
				return ranked
					.map((name) => byName.get(name))
					.filter((definition): definition is Definition => definition !== undefined)
					.map((definition) => {
						promoted.add(definition.name);
						return {
							name: definition.name,
							description: definition.description,
							classification: definition.classification,
							input_schema: z.toJSONSchema(definition.parameters),
							callable_directly: true
						};
					});
			}
		});

		const useTool = tool({
			name: 'use_tool',
			description:
				'Execute a FollowThrough tool using the exact name and input_schema returned by search_tools, when that tool is not already callable directly. Put the tool\'s arguments under the "payload" field of {"name":"exact_name","payload":{...}}. For example, after search_tools returns edit_note, call use_tool with {"name":"edit_note","payload":{"noteId":"<the note\'s uuid>","edits":[{"oldText":"<exact text copied from get_note>","newText":"<replacement>"}]}}. If you cannot build that nested object, send the same fields as a JSON string in "arguments" instead.',
			parameters: z.toJSONSchema(useToolEnvelopeSchema) as never,
			strict: false,
			// A payload that cannot pass the target's schema can only fail, so it must
			// not park the run: asking the user to approve a doomed call costs a whole
			// resume — a fresh trace, a replayed transcript and another billed turn —
			// and hands the model back the same dead end. Let it fail in `execute`
			// instead, which returns the recovery inside this turn.
			needsApproval: async (_context, input) => {
				const envelope = useToolEnvelopeSchema.safeParse(input);
				if (!envelope.success) return false;
				const target = byName.get(envelope.data.name);
				if (target?.classification !== 'mutation' || this.mode !== 'approval_required')
					return false;
				const resolved = resolveUseToolPayload(envelope.data);
				return resolved.ok && target.parameters.safeParse(resolved.payload).success;
			},
			errorFunction: (_context, error) =>
				JSON.stringify(
					isInvalidToolInput(error)
						? invalidUseToolEnvelope()
						: { failure: error instanceof Error ? error.message : String(error) }
				),
			execute: async (input, _runContext, details) => {
				const envelope = useToolEnvelopeSchema.safeParse(input);
				if (!envelope.success) return invalidUseToolEnvelope(envelope.error);
				const { name } = envelope.data;
				const target = byName.get(name);
				if (!target) return unknownUseToolName(name, names);
				const resolved = resolveUseToolPayload(envelope.data);
				const payload = resolved.ok ? resolved.payload : {};
				const validation = target.parameters.safeParse(payload);
				if (!validation.success) {
					// The tool is offered directly from here on, so the escalated recovery
					// has somewhere to send a model that keeps failing the envelope.
					promoted.add(target.name);
					return invalidUseToolPayload(
						target.name,
						validation.error,
						z.toJSONSchema(target.parameters),
						attempts.record(target.name, payload)
					);
				}
				const parsed = validation.data as Record<string, unknown>;
				if (!this.toolExecutor) return target.execute(parsed);
				return this.toolExecutor.execute(
					{
						callId: String(details?.toolCall?.callId ?? ''),
						toolName: target.name,
						arguments: parsed,
						classification: target.classification
					},
					() => target.execute(parsed)
				);
			}
		});

		return [...direct, ...discoverable, searchTools, useTool];
	}

	/** Static name + description catalog, used by the tool retriever. */
	catalog(): ToolDescriptor[] {
		return TOOL_CATALOG.filter(
			(entry) =>
				LOCKED_TOOL_NAMES.includes(entry.name) ||
				!this.toolAccess ||
				this.toolAccess.isEnabled(entry.name)
		);
	}

	private buildTool(
		definition: Definition,
		options: { isEnabled?: () => boolean } = {}
	): Tool<unknown> {
		return tool({
			name: definition.name,
			description: definition.description,
			parameters: z.toJSONSchema(definition.parameters) as never,
			strict: false,
			...(options.isEnabled ? { isEnabled: options.isEnabled } : {}),
			needsApproval: definition.classification === 'mutation' && this.mode === 'approval_required',
			errorFunction: (_context, error) =>
				JSON.stringify({ failure: error instanceof Error ? error.message : String(error) }),
			execute: async (input, _runContext, details) => {
				const parsed = input as Record<string, unknown>;
				if (!this.toolExecutor) return definition.execute(parsed);
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
	}

	private buildDefinitions(): Definition[] {
		const actor = this.actor;
		const factory = this.controllers;
		const conversationId = this.context.input.conversationId;
		const define = <T extends z.ZodObject>(
			name: string,
			description: string,
			classification: Definition['classification'],
			parameters: T,
			execute: (input: z.infer<T>) => Promise<unknown>
		): Definition => ({
			name,
			description,
			classification,
			parameters,
			execute: async (input) => {
				const parsed = parameters.parse(input);
				const result = await execute(parsed);
				return filterCreated(result, parsed as { createdAfter?: string; createdBefore?: string });
			}
		});
		return [
			define(
				'search',
				toolDescription('search'),
				'read',
				temporal({ query: z.string().min(1), projectId: id.optional() }),
				(input) =>
					factory.retrieval().search(actor, {
						query: input.query,
						...(conversationId ? { conversationId } : {}),
						...(input.projectId ? { projectId: input.projectId as ProjectId } : {}),
						...(input.createdAfter ? { createdAfter: input.createdAfter as never } : {}),
						...(input.createdBefore ? { createdBefore: input.createdBefore as never } : {})
					})
			),
			define(
				'search_note',
				toolDescription('search_note'),
				'read',
				temporal({ noteId: id, query: z.string().min(1) }),
				(input) =>
					factory.retrieval().search(actor, {
						query: input.query,
						noteId: input.noteId as NoteId,
						...(conversationId ? { conversationId } : {}),
						...(input.createdAfter ? { createdAfter: input.createdAfter as never } : {}),
						...(input.createdBefore ? { createdBefore: input.createdBefore as never } : {})
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
				z.object({ today: z.string() }),
				(input) => factory.workspace().getTodayView(actor, input as never)
			),
			define('list_projects', toolDescription('list_projects'), 'read', temporal({}), async () => ({
				projects: (await factory.projects().list(actor)).projects.map(projectProject)
			})),
			define(
				'get_project',
				toolDescription('get_project'),
				'read',
				z.object({ projectId: id }),
				(input) => factory.projects().get(actor, input as never)
			),
			define(
				'create_project',
				toolDescription('create_project'),
				'mutation',
				z.object({ name: z.string().min(1), description: z.string().optional() }),
				(input) => factory.projects().create(actor, input as never)
			),
			define(
				'rename_project',
				toolDescription('rename_project'),
				'mutation',
				z.object({ projectId: id, name: z.string().min(1) }),
				(input) => factory.projects().rename(actor, input as never)
			),
			define(
				'archive_project',
				toolDescription('archive_project'),
				'mutation',
				z.object({ projectId: id }),
				(input) => factory.projects().archive(actor, input as never)
			),
			define(
				'create_folder',
				toolDescription('create_folder'),
				'mutation',
				z.object({ projectId: id, name: z.string().min(1), parentId: id.optional() }),
				(input) => factory.projects().createFolder(actor, input as never)
			),
			define(
				'move_project_entry',
				toolDescription('move_project_entry'),
				'mutation',
				z.object({
					projectId: id,
					entryId: id,
					parentId: id.optional(),
					position: z.number().int().nonnegative()
				}),
				(input) => factory.projects().move(actor, input as never)
			),
			define(
				'get_note',
				toolDescription('get_note'),
				'read',
				z.object({ noteId: id }),
				async (input) => {
					const view = await factory.notes().get(actor, { noteId: input.noteId as NoteId });
					// The read and write surfaces must share one representation: the Markdown
					// string edit_note patches and save_note replaces, produced by the same
					// serializer the patch anchors against. ProseMirror JSON is the storage
					// format and the model never needs it, so it stays off the wire.
					return projectNoteView(view, noteMarkdownFromContent(view.note.document));
				}
			),
			define(
				'create_note',
				toolDescription('create_note'),
				'mutation',
				z.object({ title: z.string().min(1), projectId: id.optional(), parentId: id.optional() }),
				(input) => factory.notes().create(actor, input as never)
			),
			define(
				'save_note',
				toolDescription('save_note'),
				'mutation',
				z.object({
					noteId: id,
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
				z.object({
					noteId: id,
					edits: z
						.array(
							z.object({
								oldText: z.string().min(1),
								newText: z.string(),
								replaceAll: z.boolean().optional()
							})
						)
						.min(1)
						.max(20)
				}),
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
				}
			),
			define(
				'rename_note',
				toolDescription('rename_note'),
				'mutation',
				z.object({ noteId: id, title: z.string().min(1) }),
				(input) => factory.notes().rename(actor, input as never)
			),
			define(
				'archive_note',
				toolDescription('archive_note'),
				'mutation',
				z.object({ noteId: id }),
				(input) => factory.notes().archive(actor, input as never)
			),
			define(
				'publish_note',
				toolDescription('publish_note'),
				'mutation',
				z.object({ noteId: id, baseEtag: z.string() }),
				(input) => factory.notes().publish(actor, input as never)
			),
			define(
				'discard_note_draft',
				toolDescription('discard_note_draft'),
				'mutation',
				z.object({ noteId: id }),
				(input) => factory.notes().discardDraft(actor, input as never)
			),
			define(
				'list_todos',
				toolDescription('list_todos'),
				'read',
				temporal({
					projectId: id.optional(),
					noteId: id.optional(),
					status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional(),
					responsibility: z.enum(['mine', 'waiting_on']).optional(),
					dueBefore: z.string().optional()
				}),
				async (input) => ({
					todos: (await factory.todos().list(actor, input as never)).todos.map((view) =>
						projectTodo(view.todo)
					)
				})
			),
			define(
				'create_todo',
				toolDescription('create_todo'),
				'mutation',
				z.object({
					projectId: id,
					title: z.string().min(1),
					description: z.string().optional(),
					responsibility: z.enum(['mine', 'waiting_on']),
					waitingOn: z.string().optional(),
					dueDate: z.string().optional()
				}),
				(input) => factory.todos().create(actor, input as never)
			),
			define(
				'create_todos',
				toolDescription('create_todos'),
				'mutation',
				z.object({
					projectId: id,
					todos: z
						.array(
							z.object({
								title: z.string().min(1),
								description: z.string().optional(),
								responsibility: z.enum(['mine', 'waiting_on']),
								waitingOn: z.string().optional(),
								dueDate: z.string().optional()
							})
						)
						.min(1)
						.max(20)
				}),
				async (input) => {
					const created = [];
					for (const todo of input.todos) {
						created.push(
							await factory.todos().create(actor, { projectId: input.projectId, ...todo } as never)
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
					todoId: id,
					title: z.string().optional(),
					description: z.string().nullable().optional(),
					dueDate: z.string().nullable().optional(),
					responsibility: z.enum(['mine', 'waiting_on']).optional(),
					waitingOn: z.string().nullable().optional(),
					linkedNoteId: id.nullable().optional(),
					status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
				}),
				(input) => factory.todos().update(actor, input as never)
			),
			define(
				'extract_promises',
				toolDescription('extract_promises'),
				'proposal',
				z.object({ selection }),
				(input) => factory.todos().extractPromises(actor, input as never)
			),
			define(
				'relate_selection',
				toolDescription('relate_selection'),
				'proposal',
				z.object({ selection }),
				(input) => factory.relationships().suggestFromSelection(actor, input as never)
			),
			define(
				'find_references',
				toolDescription('find_references'),
				'proposal',
				z.object({ selection }),
				(input) =>
					factory
						.references()
						.suggestFromSelection(actor, input as never, { model: this.context.model })
			),
			define(
				'generate_mermaid_diagram',
				toolDescription('generate_mermaid_diagram'),
				'proposal',
				z.object({ selection, instruction: z.string().optional() }),
				(input) => factory.diagrams().generateMermaid(actor, input as never)
			),
			define(
				'revise_mermaid_diagram',
				toolDescription('revise_mermaid_diagram'),
				'mutation',
				z.object({ diagramId: id, instruction: z.string().min(1) }),
				(input) => factory.diagrams().reviseMermaid(actor, input as never)
			),
			define(
				'promote_diagram',
				toolDescription('promote_diagram'),
				'proposal',
				z.object({ diagramId: id }),
				(input) => factory.diagrams().promote(actor, input as never)
			),
			define(
				'list_suggestions',
				toolDescription('list_suggestions'),
				'read',
				temporal({ status: z.enum(['proposed', 'accepted', 'rejected', 'expired', 'reverted']) }),
				async (input) => ({
					suggestions: (await factory.suggestions().list(actor, input as never)).groups.flatMap(
						(group) => group.suggestions.map((view) => projectSuggestion(view.suggestion))
					)
				})
			),
			define(
				'accept_suggestion',
				toolDescription('accept_suggestion'),
				'mutation',
				z.object({ suggestionId: id }),
				(input) => factory.suggestions().accept(actor, input as never)
			),
			define(
				'reject_suggestion',
				toolDescription('reject_suggestion'),
				'mutation',
				z.object({ suggestionId: id }),
				(input) => factory.suggestions().reject(actor, input as never)
			),
			define(
				'revert_suggestion',
				toolDescription('revert_suggestion'),
				'mutation',
				z.object({ suggestionId: id }),
				(input) => factory.suggestions().revert(actor, input as never)
			),
			define('list_skills', toolDescription('list_skills'), 'read', temporal({}), () =>
				factory.skills().list(actor)
			),
			define(
				'load_skill',
				toolDescription('load_skill'),
				'read',
				z.object({ noteId: id }),
				async (input) => {
					const view = await factory.skills().loadForAgent(actor, {
						noteId: input.noteId as NoteId,
						contextNoteId: this.context.input.noteId,
						provenanceId: this.context.provenanceId
					});
					return projectSkillView(view, noteMarkdownFromContent(view.skill.note.document));
				}
			),
			define(
				'save_skill',
				toolDescription('save_skill'),
				'mutation',
				z.object({ noteId: id, markdown: z.string() }),
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
				z.object({
					noteId: id,
					edits: z
						.array(
							z.object({
								oldText: z.string().min(1),
								newText: z.string(),
								replaceAll: z.boolean().optional()
							})
						)
						.min(1)
						.max(20)
				}),
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
					projectId: id.optional(),
					parentId: id.optional()
				}),
				(input) => factory.skills().create(actor, input as never)
			),
			define(
				'create_skill_from_selection',
				toolDescription('create_skill_from_selection'),
				'mutation',
				z.object({
					selection,
					name: z.string().min(1),
					description: z.string(),
					triggerHints: z.array(z.string())
				}),
				(input) => factory.skills().createFromSelection(actor, input as never)
			),
			define(
				'list_skill_versions',
				toolDescription('list_skill_versions'),
				'read',
				temporal({ noteId: id }),
				(input) => factory.skills().listVersions(actor, input as never)
			),
			define(
				'restore_skill_version',
				toolDescription('restore_skill_version'),
				'mutation',
				z.object({ noteId: id, revision: z.number().int().positive() }),
				(input) => factory.skills().restoreVersion(actor, input as never)
			),
			define(
				'update_skill',
				toolDescription('update_skill'),
				'mutation',
				z.object({
					noteId: id,
					displayName: z.string().min(1).optional(),
					description: z.string().optional(),
					triggerHints: z.array(z.string()).optional(),
					isEnabled: z.boolean().optional()
				}),
				(input) => factory.skills().update(actor, input as never)
			),
			define(
				'set_skill_pinned',
				toolDescription('set_skill_pinned'),
				'mutation',
				z.object({ noteId: id, projectId: id, pinned: z.boolean() }),
				(input) => factory.skills().setPinned(actor, input as never)
			),
			define('list_api_tokens', toolDescription('list_api_tokens'), 'read', temporal({}), () =>
				factory.apiTokens().list(actor)
			),
			define(
				'revoke_api_token',
				toolDescription('revoke_api_token'),
				'mutation',
				z.object({ tokenId: id }),
				(input) => factory.apiTokens().revoke(actor, input.tokenId as never)
			),
			define(
				'list_attachments',
				toolDescription('list_attachments'),
				'read',
				temporal({ noteId: id }),
				(input) => factory.attachments().list(actor, input.noteId as NoteId)
			),
			define(
				'read_attachment',
				toolDescription('read_attachment'),
				'read',
				z.object({
					noteId: id,
					path: z.string().min(1).max(512),
					offset: z.number().int().nonnegative().optional(),
					limit: z.number().int().positive().max(20_000).optional()
				}),
				(input) =>
					factory
						.attachments()
						.read(actor, input.noteId as NoteId, input.path, input.offset, input.limit)
			),
			define(
				'list_project_memory',
				toolDescription('list_project_memory'),
				'read',
				temporal({ projectId: id }),
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
					projectId: id.optional(),
					operation: z.enum(['add', 'update', 'remove']),
					memoryEntryId: id.optional(),
					content: z.string().optional(),
					justification: z.string().optional(),
					confidence: z.number().int().min(0).max(100).optional()
				}),
				(input) => factory.memory().propose(actor, input as never)
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
					minimumConfidence: z.number().int().min(0).max(100).optional()
				}),
				(input) => factory.trustPolicies().update(actor, input as never)
			),
			define(
				'list_tool_preferences',
				toolDescription('list_tool_preferences'),
				'read',
				z.object({ projectId: id.optional() }),
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
					projectId: id.optional()
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
				(input) => factory.agentSettings().updatePreferences(actor, input)
			),
			define('list_agent_models', toolDescription('list_agent_models'), 'read', none, () =>
				factory.agentSettings().listModels(actor)
			),
			define(
				'export_document',
				toolDescription('export_document'),
				'mutation',
				z.object({
					projectId: id,
					noteIds: z.array(id),
					title: z.string().min(1),
					format: z.enum(['docx', 'pdf']),
					templateId: id.optional()
				}),
				(input) =>
					factory
						.deliverables()
						.generateDocument(actor, { ...input, projectId: input.projectId as never } as never)
			),
			define(
				'list_artifacts',
				toolDescription('list_artifacts'),
				'read',
				temporal({ projectId: id }),
				(input) => factory.deliverables().listArtifacts(actor, input.projectId as never)
			),
			define(
				'list_templates',
				toolDescription('list_templates'),
				'read',
				temporal({ projectId: id }),
				(input) => factory.deliverables().listTemplates(actor, input.projectId as never)
			),
			define(
				'get_export_settings',
				toolDescription('get_export_settings'),
				'read',
				z.object({ projectId: id }),
				(input) => factory.deliverables().getExportSettings(actor, input.projectId as never)
			),
			define(
				'update_export_settings',
				toolDescription('update_export_settings'),
				'mutation',
				z.object({
					projectId: id,
					fontFamily: z.enum(['helvetica', 'times', 'courier']),
					fontSize: z.number().min(8).max(18),
					lineHeight: z.number().min(1).max(2.2),
					margin: z.number().min(18).max(144),
					includeTitle: z.boolean().optional()
				}),
				(input) =>
					factory.deliverables().updateExportSettings(actor, input.projectId as never, {
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
				z.object({ artifactId: id }),
				(input) => factory.deliverables().getArtifact(actor, input.artifactId as never)
			),
			define(
				'download_artifact',
				toolDescription('download_artifact'),
				'read',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().downloadArtifact(actor, input.artifactId as never)
			),
			define(
				'delete_artifact',
				toolDescription('delete_artifact'),
				'mutation',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().deleteArtifact(actor, input.artifactId as never)
			),
			define(
				'regenerate_artifact',
				toolDescription('regenerate_artifact'),
				'mutation',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().regenerateArtifact(actor, input.artifactId as never)
			)
		];
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
