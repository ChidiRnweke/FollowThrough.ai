import { tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import type {
	AgentSettingsController,
	AttachmentsController,
	DeliverablesController,
	DiagramsController,
	MemoryController,
	NotesController,
	ProjectsController,
	ReferencesController,
	RelationshipsController,
	SkillsController,
	SuggestionsController,
	TodosController,
	TrustPoliciesController,
	WorkspaceController
} from '$lib/controllers';
import type { ControllerFactory } from '$lib/factories';
import type {
	ActorContext,
	AgentExecutionMode,
	NoteId,
	ProjectId,
	ProvenanceId,
	RunAgentInput
} from '$lib/models';
import { findProseMirrorDocumentIssue } from '$lib/models';
import type { AgentToolExecutor } from '$lib/services';

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
	readonly agentSettings: Coverage<AgentSettingsController>;
	readonly attachments: Coverage<AttachmentsController>;
	readonly deliverables: Coverage<DeliverablesController>;
	readonly memory: Coverage<MemoryController>;
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
		listSyncInventory: {
			kind: 'excluded',
			reason: 'Sync inventory is reserved for browser reconciliation.'
		},
		rename: { kind: 'mutation' },
		archive: { kind: 'mutation' }
	},
	todos: {
		list: { kind: 'read' },
		create: { kind: 'mutation' },
		update: { kind: 'mutation' },
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
		promote: { kind: 'mutation' }
	},
	suggestions: {
		list: { kind: 'read' },
		accept: { kind: 'mutation' },
		reject: { kind: 'mutation' },
		revert: { kind: 'mutation' }
	},
	skills: {
		list: { kind: 'read' },
		get: { kind: 'read' },
		loadForAgent: { kind: 'read' },
		create: { kind: 'mutation' },
		createFromSelection: { kind: 'mutation' },
		listVersions: { kind: 'read' },
		restoreVersion: { kind: 'mutation' },
		update: { kind: 'excluded', reason: 'Skill bundle editing is a deliberate user action.' },
		serialize: { kind: 'excluded', reason: 'The full skill is available through load_skill.' },
		setPinned: {
			kind: 'excluded',
			reason: 'Project skill pinning is a deliberate user preference.'
		}
	},
	attachments: {
		initiate: { kind: 'excluded', reason: 'The agent cannot upload local user files.' },
		complete: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		list: { kind: 'read' },
		download: { kind: 'excluded', reason: 'Signed URLs are only returned to the user interface.' },
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
	}
} as const satisfies AgentToolCoverage;

const none = z.object({});
const id = z.string().uuid();
const selection = z.object({
	noteId: id,
	revision: z.number().int().positive(),
	from: z.number().int().nonnegative(),
	to: z.number().int().nonnegative(),
	text: z.string()
});
const document = z
	.object({
		type: z.literal('doc'),
		content: z.array(z.record(z.string(), z.unknown())).optional()
	})
	.superRefine((value, context) => {
		const issue = findProseMirrorDocumentIssue(value);
		if (issue)
			context.addIssue({
				code: 'custom',
				message: `Invalid ProseMirror document at ${issue.path}: ${issue.message}`
			});
	})
	.describe(
		'Tiptap/ProseMirror JSON. Inline formatting belongs in text-node marks; for example bold text is { type: "text", text: "...", marks: [{ type: "bold" }] }. Never use strong or other formatting names as nodes.'
	);

interface RegistryContext {
	readonly provenanceId: ProvenanceId;
	readonly input: RunAgentInput;
	readonly model: string;
}

interface Definition {
	readonly name: string;
	readonly description: string;
	readonly classification: 'read' | 'proposal' | 'mutation';
	readonly parameters: z.ZodObject;
	readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export class AgentToolRegistry {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly mode: AgentExecutionMode,
		private readonly context: RegistryContext,
		private readonly toolExecutor?: AgentToolExecutor
	) {}

	tools(
		options: { classifications?: readonly Definition['classification'][] } = {}
	): Tool<unknown>[] {
		const allowed = options.classifications
			? new Set<Definition['classification']>(options.classifications)
			: undefined;
		return this.definitions()
			.filter((definition) => !allowed || allowed.has(definition.classification))
			.map((definition) =>
				tool({
					name: definition.name,
					description: definition.description,
					parameters: z.toJSONSchema(definition.parameters) as never,
					strict: false,
					needsApproval:
						definition.classification === 'mutation' && this.mode === 'approval_required',
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
				})
			);
	}

	private definitions(): Definition[] {
		const actor = this.actor;
		const factory = this.controllers;
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
			execute: (input) => execute(parameters.parse(input))
		});
		return [
			define(
				'get_workspace_context',
				'Read projects, notes, skills, and pending work.',
				'read',
				none,
				() => factory.workspace().getShellContext(actor)
			),
			define(
				'get_today_view',
				'Read work due on a local date.',
				'read',
				z.object({ today: z.string() }),
				(input) => factory.workspace().getTodayView(actor, input as never)
			),
			define('list_projects', 'List active projects.', 'read', none, () =>
				factory.projects().list(actor)
			),
			define(
				'get_project',
				'Read a project and its note tree.',
				'read',
				z.object({ projectId: id }),
				(input) => factory.projects().get(actor, input as never)
			),
			define(
				'create_project',
				'Create a project.',
				'mutation',
				z.object({ name: z.string().min(1), description: z.string().optional() }),
				(input) => factory.projects().create(actor, input as never)
			),
			define(
				'rename_project',
				'Rename a project.',
				'mutation',
				z.object({ projectId: id, name: z.string().min(1) }),
				(input) => factory.projects().rename(actor, input as never)
			),
			define(
				'archive_project',
				'Archive a project.',
				'mutation',
				z.object({ projectId: id }),
				(input) => factory.projects().archive(actor, input as never)
			),
			define(
				'create_folder',
				'Create a folder in a project.',
				'mutation',
				z.object({ projectId: id, name: z.string().min(1), parentId: id.optional() }),
				(input) => factory.projects().createFolder(actor, input as never)
			),
			define(
				'move_project_entry',
				'Move or reorder a note or folder.',
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
				'Read a note with backlinks, references, diagrams, todos, and proposals.',
				'read',
				z.object({ noteId: id }),
				(input) => factory.notes().get(actor, input as never)
			),
			define(
				'create_note',
				'Create a note.',
				'mutation',
				z.object({ title: z.string().min(1), projectId: id.optional(), parentId: id.optional() }),
				(input) => factory.notes().create(actor, input as never)
			),
			define(
				'save_note',
				'Save a complete current note revision using valid Tiptap/ProseMirror JSON.',
				'mutation',
				z.object({
					note: z.object({
						id,
						userId: id,
						projectId: id,
						parentId: id.optional(),
						kind: z.enum(['folder', 'note', 'skill']),
						position: z.number().int(),
						title: z.string(),
						document,
						plainText: z.string(),
						currentRevision: z.number().int(),
						isPinned: z.boolean(),
						archivedAt: z.string().optional(),
						createdAt: z.string(),
						updatedAt: z.string()
					})
				}),
				(input) => factory.notes().save(actor, input as never)
			),
			define(
				'rename_note',
				'Rename a note.',
				'mutation',
				z.object({ noteId: id, title: z.string().min(1) }),
				(input) => factory.notes().rename(actor, input as never)
			),
			define('archive_note', 'Archive a note.', 'mutation', z.object({ noteId: id }), (input) =>
				factory.notes().archive(actor, input as never)
			),
			define(
				'list_todos',
				'List todos using optional filters.',
				'read',
				z.object({
					projectId: id.optional(),
					noteId: id.optional(),
					status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional(),
					responsibility: z.enum(['mine', 'waiting_on']).optional(),
					dueBefore: z.string().optional()
				}),
				(input) => factory.todos().list(actor, input as never)
			),
			define(
				'create_todo',
				'Create a todo.',
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
				'update_todo',
				'Edit a todo or change its status.',
				'mutation',
				z.object({
					todoId: id,
					title: z.string().optional(),
					description: z.string().optional(),
					dueDate: z.string().optional(),
					status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
				}),
				(input) => factory.todos().update(actor, input as never)
			),
			define(
				'extract_promises',
				'Propose todos from a text selection without bypassing review.',
				'proposal',
				z.object({ selection }),
				(input) => factory.todos().extractPromises(actor, input as never)
			),
			define(
				'relate_selection',
				'Propose relationships for a text selection.',
				'proposal',
				z.object({ selection }),
				(input) => factory.relationships().suggestFromSelection(actor, input as never)
			),
			define(
				'find_references',
				'Propose ranked references for a text selection.',
				'proposal',
				z.object({ selection }),
				(input) =>
					factory
						.references()
						.suggestFromSelection(actor, input as never, { model: this.context.model })
			),
			define(
				'generate_mermaid_diagram',
				'Propose a Mermaid diagram from a text selection.',
				'proposal',
				z.object({ selection, instruction: z.string().optional() }),
				(input) => factory.diagrams().generateMermaid(actor, input as never)
			),
			define(
				'revise_mermaid_diagram',
				'Revise a durable Mermaid diagram.',
				'mutation',
				z.object({ diagramId: id, instruction: z.string().min(1) }),
				(input) => factory.diagrams().reviseMermaid(actor, input as never)
			),
			define(
				'promote_diagram',
				'Promote Mermaid to a durable draw.io diagram.',
				'mutation',
				z.object({ diagramId: id }),
				(input) => factory.diagrams().promote(actor, input as never)
			),
			define(
				'list_suggestions',
				'List reviewable suggestions by status.',
				'read',
				z.object({ status: z.enum(['proposed', 'accepted', 'rejected', 'expired', 'reverted']) }),
				(input) => factory.suggestions().list(actor, input as never)
			),
			define(
				'accept_suggestion',
				'Accept and apply a suggestion.',
				'mutation',
				z.object({ suggestionId: id }),
				(input) => factory.suggestions().accept(actor, input as never)
			),
			define(
				'reject_suggestion',
				'Reject a suggestion.',
				'mutation',
				z.object({ suggestionId: id }),
				(input) => factory.suggestions().reject(actor, input as never)
			),
			define(
				'revert_suggestion',
				'Revert an accepted suggestion.',
				'mutation',
				z.object({ suggestionId: id }),
				(input) => factory.suggestions().revert(actor, input as never)
			),
			define('list_skills', 'List enabled skill summaries and trigger hints.', 'read', none, () =>
				factory.skills().list(actor)
			),
			define(
				'get_skill',
				'Read a skill and usage history without recording agent use.',
				'read',
				z.object({ noteId: id }),
				(input) => factory.skills().get(actor, input as never)
			),
			define(
				'load_skill',
				'Load full skill instructions when its summary applies and record usage.',
				'read',
				z.object({ noteId: id }),
				(input) =>
					factory.skills().loadForAgent(actor, {
						noteId: input.noteId as NoteId,
						contextNoteId: this.context.input.noteId,
						provenanceId: this.context.provenanceId
					})
			),
			define(
				'create_skill',
				'Create a reusable skill.',
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
				'Create a skill from selected note text.',
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
				'List immutable revisions of a skill.',
				'read',
				z.object({ noteId: id }),
				(input) => factory.skills().listVersions(actor, input as never)
			),
			define(
				'restore_skill_version',
				'Restore an old skill revision as a new current revision.',
				'mutation',
				z.object({ noteId: id, revision: z.number().int().positive() }),
				(input) => factory.skills().restoreVersion(actor, input as never)
			),
			define(
				'list_attachments',
				'List the immutable resources attached to a note or skill bundle.',
				'read',
				z.object({ noteId: id }),
				(input) => factory.attachments().list(actor, input.noteId as NoteId)
			),
			define(
				'read_attachment',
				'Read a bounded chunk from a safely parsed text or PDF attachment. Scripts are returned as text and never executed.',
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
				'Read the durable memory entries a project shares with agents: facts, decisions, constraints, terminology, and preferences.',
				'read',
				z.object({ projectId: id }),
				(input) =>
					factory.memory().list(actor, {
						projectId: input.projectId as ProjectId,
						sharedOnly: true
					})
			),
			define(
				'list_user_memory',
				'Read the user profile memory shared with agents: who the user is, their role, goals, relationships, preferences, and working style across all projects.',
				'read',
				none,
				() => factory.memory().list(actor, { sharedOnly: true })
			),
			define(
				'propose_memory_change',
				'Propose adding, updating, or removing a memory entry without bypassing review. Scope "project" remembers durable project facts, decisions, constraints, and terminology. Scope "user" builds the user profile: whenever the user reveals who they are — role, team, goals, relationships, expertise, preferences, or how they like to work — propose remembering it so future conversations already know them.',
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
			define('list_trust_policies', 'Read pipeline-specific trust policies.', 'read', none, () =>
				factory.trustPolicies().list(actor)
			),
			define(
				'update_trust_policy',
				'Change a pipeline-specific trust policy.',
				'mutation',
				z.object({
					pipeline: z.enum(['extract_promises', 'relate', 'reference', 'agent', 'memory']),
					autoAcceptEnabled: z.boolean(),
					minimumConfidence: z.number().int().min(0).max(100).optional()
				}),
				(input) => factory.trustPolicies().update(actor, input as never)
			),
			define(
				'get_agent_preferences',
				'Read default chat model and execution mode.',
				'read',
				none,
				() => factory.agentSettings().getPreferences(actor)
			),
			define(
				'update_agent_preferences',
				'Change default chat model or execution mode.',
				'mutation',
				z.object({
					defaultModel: z.string().nullable().optional(),
					executionMode: z.enum(['approval_required', 'auto_accept'])
				}),
				(input) => factory.agentSettings().updatePreferences(actor, input)
			),
			define(
				'list_agent_models',
				'List OpenRouter chat models and tool support.',
				'read',
				none,
				() => factory.agentSettings().listModels(actor)
			),
			define(
				'export_document',
				'Generate an artifact document (DOCX or PDF) from one or more project notes. Optionally apply a project template.',
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
				'List generated document artifacts for a project.',
				'read',
				z.object({ projectId: id }),
				(input) => factory.deliverables().listArtifacts(actor, input.projectId as never)
			),
			define(
				'list_templates',
				'List available DOCX templates for a project.',
				'read',
				z.object({ projectId: id }),
				(input) => factory.deliverables().listTemplates(actor, input.projectId as never)
			),
			define(
				'get_export_settings',
				'Read the project document-export settings (font, size, line height, margins).',
				'read',
				z.object({ projectId: id }),
				(input) => factory.deliverables().getExportSettings(actor, input.projectId as never)
			),
			define(
				'update_export_settings',
				'Change the project document-export settings.',
				'mutation',
				z.object({
					projectId: id,
					fontFamily: z.enum(['helvetica', 'times', 'courier']),
					fontSize: z.number().min(8).max(18),
					lineHeight: z.number().min(1).max(2.2),
					margin: z.number().min(18).max(144)
				}),
				(input) =>
					factory.deliverables().updateExportSettings(actor, input.projectId as never, {
						fontFamily: input.fontFamily,
						fontSize: input.fontSize,
						lineHeight: input.lineHeight,
						margin: input.margin
					})
			),
			define(
				'get_artifact',
				'Read a generated artifact record.',
				'read',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().getArtifact(actor, input.artifactId as never)
			),
			define(
				'download_artifact',
				'Create a time-limited download link for a generated artifact.',
				'read',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().downloadArtifact(actor, input.artifactId as never)
			),
			define(
				'delete_artifact',
				'Delete a generated artifact.',
				'mutation',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().deleteArtifact(actor, input.artifactId as never)
			),
			define(
				'regenerate_artifact',
				'Regenerate an artifact from its source notes and return a fresh download link.',
				'mutation',
				z.object({ artifactId: id }),
				(input) => factory.deliverables().regenerateArtifact(actor, input.artifactId as never)
			)
		];
	}
}
