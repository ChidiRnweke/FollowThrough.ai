import { tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import type {
	AgentSettingsController,
	DiagramsController,
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
	ProvenanceId,
	RunAgentInput
} from '$lib/models';

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
		restoreVersion: { kind: 'mutation' }
	},
	trustPolicies: { list: { kind: 'read' }, update: { kind: 'mutation' } },
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
const document = z.object({
	type: z.literal('doc'),
	content: z.array(z.record(z.string(), z.unknown())).optional()
});

interface RegistryContext {
	readonly provenanceId: ProvenanceId;
	readonly input: RunAgentInput;
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
		private readonly context: RegistryContext
	) {}

	tools(): Tool<unknown>[] {
		return this.definitions().map((definition) =>
			tool({
				name: definition.name,
				description: definition.description,
				parameters: z.toJSONSchema(definition.parameters) as never,
				strict: false,
				needsApproval:
					definition.classification === 'mutation' && this.mode === 'approval_required',
				errorFunction: (_context, error) =>
					JSON.stringify({ failure: error instanceof Error ? error.message : String(error) }),
				execute: async (input) => definition.execute(input as Record<string, unknown>)
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
				'Save a complete current note revision.',
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
				(input) => factory.references().suggestFromSelection(actor, input as never)
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
			define('list_trust_policies', 'Read pipeline-specific trust policies.', 'read', none, () =>
				factory.trustPolicies().list(actor)
			),
			define(
				'update_trust_policy',
				'Change a pipeline-specific trust policy.',
				'mutation',
				z.object({
					pipeline: z.enum(['extract_promises', 'relate', 'reference', 'agent']),
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
			)
		];
	}
}
