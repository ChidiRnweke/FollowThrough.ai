import { PROPOSAL_AUTO_ACCEPT_PIPELINES, webSearchEngines } from '$lib/models/agent';
import type { ArtifactId } from '$lib/models/deliverables';
import { exportSettingsSchema } from '$lib/models/deliverables';
import type { DiagramId } from '$lib/models/diagrams';
import type { ApiTokenId } from '$lib/models/identity';
import type { MemoryChangePayload, MemoryEntryId } from '$lib/models/memory';
import type { NoteEtag, NoteId, NoteRevisionId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Confidence } from '$lib/models/provenance';
import type { SuggestionId } from '$lib/models/suggestions';
import { createTodoBatchSchema, type TodoId } from '$lib/models/todos';
import type { JsonPatch, WidgetDraft } from '$lib/models/widgets';
import { type WidgetId } from '$lib/models/widgets';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import { z } from 'zod';
const none = z.object({});
const dateTime = z.iso.datetime({ offset: true }).transform((value) => value as DateTime);
const optionalModelField = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
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
const widgetId = z
	.string()
	.uuid()
	.describe('Exact widget UUID, as the widget node in a note records it.')
	.transform((value) => value as WidgetId);
const widgetPatchText = z
	.string()
	.min(2)
	.describe('An RFC 6902 JSON Patch array, encoded as a JSON string.');
const noteRevisionId = z
	.string()
	.uuid()
	.transform((value) => value as NoteRevisionId);
const noteEtag = z
	.string()
	.min(1)
	.transform((value) => value as NoteEtag);
const apiTokenId = z
	.string()
	.uuid()
	.transform((value) => value as ApiTokenId);
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
const noteEdit = z.object({
	oldText: z.string().min(1),
	newText: z.string(),
	replaceAll: z.boolean().optional()
});
const noteEdits = z.object({
	noteId: noteId,
	edits: z.array(noteEdit).min(1)
});
const localDate = z.iso.date().transform((value) => value as LocalDate);
const artifactId = z
	.string()
	.uuid()
	.transform((value) => value as ArtifactId);
const suggestionId = z
	.string()
	.uuid()
	.transform((value) => value as SuggestionId);
export const agentToolInputSchemas = {
	ls: z.object({ path: z.string().min(1).optional() }),
	grep: z.object({
		pattern: z.string(),
		path: z.string().min(1),
		fixed: z.boolean().optional(),
		ignoreCase: z.boolean().optional()
	}),
	sed: z.object({
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
	search: temporal({
		query: z.string().min(1),
		projectId: optionalModelField(projectId).describe(
			'Exact project UUID returned by a FollowThrough tool; never pass a project name. Omit to search all projects.'
		)
	}),
	search_note: temporal({ noteId: noteId, query: z.string().min(1) }),
	get_workspace_context: none,
	get_today_view: z.object({ today: localDate }),
	list_projects: temporal({}),
	get_project: z.object({ projectId: projectId }),
	create_project: z.object({ name: z.string().min(1), description: z.string().optional() }),
	rename_project: z.object({ projectId: projectId, name: z.string().min(1) }),
	archive_project: z.object({ projectId: projectId }),
	create_folder: z.object({
		projectId: projectId,
		name: z.string().min(1),
		parentId: noteId.optional()
	}),
	move_project_entry: z.object({
		projectId: projectId,
		entryId: noteId,
		parentId: noteId.optional(),
		position: z.number().int().nonnegative()
	}),
	get_note: z.object({ noteId: noteId }),
	create_note: z.object({
		title: z.string().min(1),
		projectId: projectId.optional(),
		parentId: noteId
			.optional()
			.describe(
				'Set only when the user asked for a specific existing folder. Copy that folder id from workspace context; otherwise omit this field. Never use a note id, project id, or invented id.'
			)
	}),
	save_note: z.object({
		noteId: noteId,
		markdown: z.string()
	}),
	edit_note: noteEdits,
	rename_note: z.object({ noteId: noteId, title: z.string().min(1) }),
	archive_note: z.object({ noteId: noteId }),
	restore_note: z.object({ noteId: noteId }),
	list_trashed_notes: z.object({ projectId: projectId.optional() }),
	delete_note_forever: z.object({ noteId: noteId }),
	empty_note_trash: z.object({ projectId: projectId.optional() }),
	list_note_versions: z.object({ noteId: noteId }),
	diff_note_versions: z.object({
		noteId: noteId,
		revisionId: noteRevisionId,
		againstRevisionId: noteRevisionId.optional()
	}),
	restore_note_version: z.object({ noteId: noteId, revisionId: noteRevisionId }),
	publish_note: z.object({ noteId: noteId, baseEtag: noteEtag }),
	discard_note_draft: z.object({ noteId: noteId }),
	list_todos: temporal({
		projectId: optionalModelField(projectId),
		noteId: optionalModelField(noteId),
		status: optionalModelField(z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled'])),
		responsibility: optionalModelField(z.enum(['mine', 'waiting_on'])),
		dueBefore: optionalModelField(localDate)
	}),
	create_todo: z.object({
		projectId: projectId,
		title: z.string().min(1),
		description: z.string().optional(),
		responsibility: z.enum(['mine', 'waiting_on']),
		waitingOn: z.string().optional(),
		dueDate: localDate.optional()
	}),
	create_todos: createTodoBatchSchema,
	update_todo: z.object({
		todoId: todoId,
		title: z.string().optional(),
		description: z.string().nullable().optional(),
		dueDate: localDate.nullable().optional(),
		responsibility: z.enum(['mine', 'waiting_on']).optional(),
		waitingOn: z.string().nullable().optional(),
		linkedNoteId: noteId.nullable().optional(),
		status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']).optional()
	}),
	revise_mermaid_diagram: z.object({ diagramId: diagramId, instruction: z.string().min(1) }),
	search_icons: z.object({
		query: z.string().min(1),
		limit: z.number().int().min(1).max(12).optional()
	}),
	read_project_diagram: z.object({ diagramId: diagramId }),
	promote_diagram: z.object({ diagramId: diagramId }),
	list_suggestions: temporal({
		status: z.enum(['proposed', 'accepted', 'rejected', 'expired', 'reverted'])
	}),
	accept_suggestion: z.object({ suggestionId: suggestionId }),
	reject_suggestion: z.object({ suggestionId: suggestionId }),
	revert_suggestion: z.object({ suggestionId: suggestionId }),
	list_skills: temporal({}),
	save_skill: z.object({ noteId, markdown: z.string() }),
	edit_skill: noteEdits,
	create_skill: z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		triggerHints: z.array(z.string()).optional(),
		projectId: projectId.optional(),
		parentId: noteId.optional()
	}),
	list_skill_versions: temporal({ noteId: noteId }),
	restore_skill_version: z.object({ noteId: noteId, revision: z.number().int().positive() }),
	update_skill: z.object({
		noteId: noteId,
		displayName: z.string().min(1).optional(),
		description: z.string().optional(),
		triggerHints: z.array(z.string()).optional(),
		isEnabled: z.boolean().optional()
	}),
	set_skill_pinned: z.object({ noteId: noteId, projectId: projectId, pinned: z.boolean() }),
	list_api_tokens: temporal({}),
	revoke_api_token: z.object({ tokenId: apiTokenId }),
	list_attachments: temporal({ noteId: noteId }),
	list_project_memory: temporal({ projectId: projectId }),
	list_user_memory: temporal({}),
	propose_memory_change: z.object({
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
	list_trust_policies: temporal({}),
	update_trust_policy: z.object({
		pipeline: z.enum(PROPOSAL_AUTO_ACCEPT_PIPELINES),
		autoAcceptEnabled: z.boolean(),
		minimumConfidence: confidence
			.optional()
			.describe('Optional integer percentage from 0 to 100; use 90, never 0.9.')
	}),
	list_tool_preferences: z.object({ projectId: projectId.optional() }),
	set_tool_enabled: z.object({
		toolName: z.string().min(1),
		enabled: z.boolean(),
		projectId: projectId.optional()
	}),
	get_agent_preferences: none,
	update_agent_preferences: z.object({
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
	list_agent_models: none,
	export_document: z.object({
		projectId: projectId,
		noteIds: z.array(id),
		title: z.string().min(1),
		format: z.enum(['docx', 'pdf']),
		templateId: id.optional()
	}),
	list_artifacts: temporal({ projectId: projectId }),
	list_templates: temporal({ projectId: projectId }),
	get_export_settings: z.object({ projectId: projectId }),
	update_export_settings: exportSettingsSchema.extend({ projectId }),
	get_artifact: z.object({ artifactId: artifactId }),
	download_artifact: z.object({ artifactId: artifactId }),
	delete_artifact: z.object({ artifactId: artifactId }),
	regenerate_artifact: z.object({ artifactId: artifactId }),
	read_widget_catalog: z.object({}),
	create_widget: z.object({
		title: z.string().min(1),
		layout: z
			.string()
			.min(2)
			.describe(
				'The layout as one JSON object serialised to a string: double-quoted keys, escaped inner quotes, and nothing before or after the closing brace.'
			),
		data: z
			.string()
			.min(2)
			.describe('The data as one JSON object serialised to a string, like layout.'),
		projectId: projectId.optional(),
		noteId: noteId
			.optional()
			.describe('The note the user wants the widget in. Creating does not embed it.')
	}),
	list_widgets: z.object({ projectId: projectId.optional() }),
	read_widget: z.object({ widgetId }),
	edit_widget_data: z.object({
		widgetId,
		expectedDataRevision: z.number().int().positive(),
		patch: widgetPatchText
	}),
	edit_widget_layout: z.object({
		widgetId,
		expectedLayoutRevision: z.number().int().positive(),
		patch: widgetPatchText
	}),
	extract_promises: z.object({
		responsibility: z
			.enum(['mine', 'waiting_on'])
			.optional()
			.describe(
				'Use mine for commitments made by the user (I/my), waiting_on for commitments made by someone else, or omit only when the user asked for every actor.'
			)
	}),
	relate_selection: z.object({}),
	find_references: z.object({}),
	create_skill_from_selection: z.object({
		name: z.string().min(1),
		description: z.string(),
		triggerHints: z.array(z.string())
	}),
	load_skill: z.object({ noteId: noteId }),
	create_diagram: z.object({
		source: z.string().min(1),
		title: z.string().min(1).optional(),
		projectId: projectId.optional()
	}),
	edit_diagram: z.object({
		source: z.string().min(1),
		title: z.string().min(1).optional(),
		diagramId
	}),
	read_canvas_diagram: z.object({})
};
export type AgentToolInput<Name extends keyof typeof agentToolInputSchemas> = z.output<
	(typeof agentToolInputSchemas)[Name]
>;

/** Parsing failures remain values until project authority has been checked. */
export type AgentWidgetDraftRead =
	| { readonly kind: 'ready'; readonly draft: WidgetDraft }
	| { readonly kind: 'failure'; readonly error: Error };
export type AgentWidgetCreationInput = Omit<
	AgentToolInput<'create_widget'>,
	'layout' | 'data' | 'title'
> & { readonly draft: AgentWidgetDraftRead };
export type AgentWidgetDataEditInput = Omit<AgentToolInput<'edit_widget_data'>, 'patch'> & {
	readonly patch: JsonPatch;
};
export type AgentWidgetLayoutEditInput = Omit<AgentToolInput<'edit_widget_layout'>, 'patch'> & {
	readonly patch: JsonPatch;
};
export type AgentMemoryProposalInput = MemoryChangePayload & { readonly confidence?: Confidence };
