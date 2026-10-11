import { ProjectChoiceRequiredError, ValidationError } from '$lib/errors';
import type { ToolClassification } from '$lib/models/agent';
import type { AgentGrepResult, AgentLsResult, AgentSedResult } from '$lib/models/agent-files';
import type { AgentToolContext, McpToolContext } from '$lib/models/agent-tool-context';
import { agentToolInputSchemas } from '$lib/models/agent-tool-inputs';
import type { AgentTool } from '$lib/models/agent-tool-protocol';
import { TOOL_DESCRIPTIONS, type ToolName } from '$lib/models/agent/tool-catalog';
import { toolFailure } from '$lib/models/agent/tool-failure';
import type { ActorContext } from '$lib/models/identity';
import {
	noteChangeRequestSchema,
	noteChangeReviewSchema,
	type NoteChangeReview,
	type NoteChangeTarget,
	type NoteId,
	type TextSelection
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TemplateId } from '$lib/models/deliverables';
import type { WidgetId } from '$lib/models/widgets';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ApplyReviewedNoteChangeOutput } from '$lib/models/notes';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { z } from 'zod';
import { bindToolArguments, parseToolArguments } from './arguments';
import {
	readMemoryProposal,
	readWidgetCreation,
	readWidgetDataEdit,
	readWidgetLayoutEdit
} from './inputs';
import { toolResult } from './output';
import {
	createdWidget,
	deletedArtifact,
	diagramFile,
	exportSettings,
	foundArtifact,
	noteView,
	revokedToken,
	skillView,
	workspaceContext,
	writtenWithEtag,
	projectMemory,
	projectNoteRevision,
	projectNoteWrite,
	projectProject,
	projectSuggestion,
	projectTodo,
	projectTodoWrite
} from './views';

const described = (name: ToolName) => {
	const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
	return { name, description: entry.description };
};

/**
 * The model asked for a write without naming a project. The operation answers with the
 * choices; the model is told how to make one, including that it can create the project.
 */
const projectChoiceFailure = (error: ProjectChoiceRequiredError): ValidationError =>
	new ValidationError(
		error.projects.length
			? `projectId is required to ${error.action}. Retry naming one of these projects: ${error.projects.map((project) => `${project.name} (${project.id})`).join(', ')}.`
			: `projectId is required to ${error.action}, and this workspace has no projects yet. Call create_project first, then retry with its id.`
	);

const answered = async <Result>(call: () => Promise<Result>): Promise<Result> => {
	try {
		return await call();
	} catch (error) {
		if (error instanceof ProjectChoiceRequiredError) throw projectChoiceFailure(error);
		throw error;
	}
};

/** A tool that runs one controller operation and answers with the projection the model reads. */
const defineTool = <Name extends ToolName, Shape extends z.ZodRawShape, Result>(
	name: Name,
	classification: ToolClassification,
	parameters: z.ZodObject<Shape>,
	execute: (input: z.infer<z.ZodObject<Shape>>) => Promise<Result>
): AgentTool => ({
	kind: 'direct',
	...described(name),
	classification,
	parameters: parameters.strict(),
	prepare: (input) =>
		bindToolArguments(parameters, input, async (args, payload) =>
			toolResult(await answered(() => execute(args)), payload)
		)
});

const fileResult = (result: AgentLsResult | AgentGrepResult | AgentSedResult) => {
	if (result.kind !== 'error') return result;
	return toolFailure(result.code, result.message, 'Follow the exact nextActions below.', {
		...('requestedPath' in result
			? { requestedPath: result.requestedPath }
			: { pattern: result.pattern }),
		...('lineCount' in result ? { lineCount: result.lineCount } : {}),
		nextActions: result.nextActions.map((action) => ({
			reason: action.reason,
			tool: action.tool,
			arguments: z.json().parse(action.arguments)
		}))
	});
};

const noteChangeOutput = (
	review: Extract<NoteChangeReview, { kind: 'prepared' }>,
	result: ApplyReviewedNoteChangeOutput
) => {
	if (result.kind === 'failure')
		return toolFailure(
			result.code,
			result.message,
			'Read the note and submit a new tool call for review.'
		);
	const projection = projectNoteWrite(result.note);
	return review.change.operation.kind === 'patch'
		? {
				...projection,
				appliedEdits: review.change.operation.appliedEdits,
				matchedTexts: [...review.change.operation.matchedTexts]
			}
		: projection;
};

/**
 * A note or skill change the user reviews before it applies: the notes controller prepares the
 * exact change, and the approved change is the one applied, never a re-run of the request.
 */
const defineNoteChangeTool = <Name extends ToolName, Shape extends z.ZodRawShape>(
	controllers: ControllerFactory,
	actor: ActorContext,
	name: Name,
	parameters: z.ZodObject<Shape>,
	change: { readonly kind: 'patch' | 'replace'; readonly target: NoteChangeTarget }
): AgentTool => ({
	kind: 'reviewed',
	...described(name),
	classification: 'mutation',
	parameters: parameters.strict(),
	review: {
		kind: 'note_change',
		restore: (saved) => JSON.stringify(noteChangeReviewSchema.parse(JSON.parse(saved))),
		prepare: async (input, saved) => {
			const { payload } = parseToolArguments(parameters, input);
			const review =
				saved === undefined
					? await controllers
							.notes()
							.prepareChange(
								actor,
								noteChangeRequestSchema.parse({ ...payload, kind: change.kind }),
								change.target
							)
					: noteChangeReviewSchema.parse(JSON.parse(saved));
			const content = JSON.stringify(review);
			if (review.kind === 'failure')
				return {
					kind: 'failure',
					arguments: payload,
					review: content,
					failure: toolFailure(
						'NOTE_REVIEW_FAILED',
						'No changes were applied.',
						'Correct the problems below and submit a new tool call.',
						{ problems: [...review.problems] }
					)
				};
			return {
				kind: 'prepared',
				arguments: payload,
				review: content,
				apply: async () =>
					toolResult(
						noteChangeOutput(
							review,
							await controllers.notes().applyReviewedChange(actor, review.change, change.target)
						),
						payload
					)
			};
		}
	}
});

const sharedToolDefinitions = (
	controllers: ControllerFactory,
	actor: ActorContext,
	provenanceId: ProvenanceId
) => {
	const retrieval = () => ({
		ls: defineTool(
			'ls',
			'read',
			agentToolInputSchemas.ls,
			async (input) => await fileResult(await controllers.agentFiles().ls(actor, input.path))
		),
		grep: defineTool(
			'grep',
			'read',
			agentToolInputSchemas.grep,
			async (input) =>
				await fileResult(
					await controllers.agentFiles().grep(actor, {
						pattern: input.pattern,
						path: input.path,
						fixed: input.fixed ?? false,
						ignoreCase: input.ignoreCase ?? false
					})
				)
		),
		sed: defineTool(
			'sed',
			'read',
			agentToolInputSchemas.sed,
			async (input) =>
				await fileResult(await controllers.agentFiles().sed(actor, input.path, input.range))
		),
		search: defineTool('search', 'read', agentToolInputSchemas.search, async (input) =>
			controllers.retrieval().search(actor, {
				query: input.query,
				...(input.projectId ? { projectId: input.projectId as ProjectId } : {}),
				...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
				...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
			})
		),
		search_note: defineTool(
			'search_note',
			'read',
			agentToolInputSchemas.search_note,
			async (input) =>
				controllers.retrieval().search(actor, {
					query: input.query,
					noteId: input.noteId as NoteId,
					...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
					...(input.createdBefore ? { createdBefore: input.createdBefore } : {})
				})
		),
		get_workspace_context: defineTool(
			'get_workspace_context',
			'read',
			agentToolInputSchemas.get_workspace_context,
			async () => workspaceContext(await controllers.workspace().getShellContext(actor))
		),
		get_today_view: defineTool(
			'get_today_view',
			'read',
			agentToolInputSchemas.get_today_view,
			async (input) => controllers.workspace().getTodayView(actor, input)
		)
	});
	const projects = () => ({
		list_projects: defineTool(
			'list_projects',
			'read',
			agentToolInputSchemas.list_projects,
			async () => ({
				projects: (await controllers.projects().list(actor)).projects.map(projectProject)
			})
		),
		get_project: defineTool(
			'get_project',
			'read',
			agentToolInputSchemas.get_project,
			async (input) => controllers.projects().get(actor, input)
		),
		create_project: defineTool(
			'create_project',
			'mutation',
			agentToolInputSchemas.create_project,
			async (input) => projectProject((await controllers.projects().create(actor, input)).project)
		),
		rename_project: defineTool(
			'rename_project',
			'mutation',
			agentToolInputSchemas.rename_project,
			async (input) => projectProject((await controllers.projects().rename(actor, input)).project)
		),
		archive_project: defineTool(
			'archive_project',
			'mutation',
			agentToolInputSchemas.archive_project,
			async (input) => projectProject((await controllers.projects().archive(actor, input)).project)
		),
		create_folder: defineTool(
			'create_folder',
			'mutation',
			agentToolInputSchemas.create_folder,
			// A folder is a note, so it takes the note write projection rather than shipping a
			// (necessarily empty) ProseMirror document with it.
			async (input) =>
				projectNoteWrite((await controllers.projects().createFolder(actor, input)).folder)
		),
		move_project_entry: defineTool(
			'move_project_entry',
			'mutation',
			agentToolInputSchemas.move_project_entry,
			async (input) => controllers.projects().move(actor, input)
		)
	});
	const notes = () => ({
		get_note: defineTool('get_note', 'read', agentToolInputSchemas.get_note, async (input) =>
			noteView(await controllers.notes().readDocument(actor, { noteId: input.noteId as NoteId }))
		),
		create_note: defineTool(
			'create_note',
			'mutation',
			// Optional here and required in `CreateNoteInput` on purpose. The service
			// will not invent a project, and a bare schema rejection would tell the
			// model only that a field is missing — which is what left it guessing in
			// the first place. Accepting the absence lets the failure carry the
			// projects it can choose from, which is an adapter's job.
			agentToolInputSchemas.create_note,
			async (input) => projectNoteWrite((await controllers.notes().create(actor, input)).note)
		),
		save_note: defineNoteChangeTool(
			controllers,
			actor,
			'save_note',
			agentToolInputSchemas.save_note,
			{
				kind: 'replace',
				target: 'authored'
			}
		),
		edit_note: defineNoteChangeTool(
			controllers,
			actor,
			'edit_note',
			agentToolInputSchemas.edit_note,
			{
				kind: 'patch',
				target: 'authored'
			}
		),
		rename_note: defineTool(
			'rename_note',
			'mutation',
			agentToolInputSchemas.rename_note,
			async (input) => projectNoteWrite((await controllers.notes().rename(actor, input)).note)
		),
		archive_note: defineTool(
			'archive_note',
			'mutation',
			agentToolInputSchemas.archive_note,
			async (input) => projectNoteWrite((await controllers.notes().archive(actor, input)).note)
		),
		restore_note: defineTool(
			'restore_note',
			'mutation',
			agentToolInputSchemas.restore_note,
			async (input) => projectNoteWrite((await controllers.notes().restore(actor, input)).note)
		),
		list_trashed_notes: defineTool(
			'list_trashed_notes',
			'read',
			agentToolInputSchemas.list_trashed_notes,
			async (input) => controllers.notes().listTrash(actor, input)
		),
		delete_note_forever: defineTool(
			'delete_note_forever',
			'mutation',
			agentToolInputSchemas.delete_note_forever,
			async (input) => controllers.notes().deleteForever(actor, input)
		),
		empty_note_trash: defineTool(
			'empty_note_trash',
			'mutation',
			agentToolInputSchemas.empty_note_trash,
			async (input) => controllers.notes().emptyTrash(actor, input)
		),
		list_note_versions: defineTool(
			'list_note_versions',
			'read',
			agentToolInputSchemas.list_note_versions,
			async (input) => controllers.notes().listRevisions(actor, input)
		),
		diff_note_versions: defineTool(
			'diff_note_versions',
			'read',
			agentToolInputSchemas.diff_note_versions,
			async (input) => controllers.notes().compareRevisions(actor, input)
		),
		restore_note_version: defineTool(
			'restore_note_version',
			'mutation',
			agentToolInputSchemas.restore_note_version,
			async (input) => writtenWithEtag(await controllers.notes().restoreRevision(actor, input))
		),
		publish_note: defineTool(
			'publish_note',
			'mutation',
			agentToolInputSchemas.publish_note,
			async (input) => writtenWithEtag(await controllers.notes().publish(actor, input))
		),
		discard_note_draft: defineTool(
			'discard_note_draft',
			'mutation',
			agentToolInputSchemas.discard_note_draft,
			async (input) => controllers.notes().discardDraft(actor, input)
		)
	});
	const todos = () => ({
		list_todos: defineTool(
			'list_todos',
			'read',
			agentToolInputSchemas.list_todos,
			async (input) => ({
				todos: (await controllers.todos().list(actor, input)).todos.map((view) =>
					projectTodo(view.todo)
				)
			})
		),
		create_todo: defineTool(
			'create_todo',
			'mutation',
			agentToolInputSchemas.create_todo,
			async (input) => projectTodoWrite((await controllers.todos().create(actor, input)).todo)
		),
		create_todos: defineTool(
			'create_todos',
			'mutation',
			agentToolInputSchemas.create_todos,
			async (input) => ({
				todos: (await controllers.todos().createBatch(actor, input)).todos.map(projectTodoWrite)
			})
		),
		update_todo: defineTool(
			'update_todo',
			'mutation',
			agentToolInputSchemas.update_todo,
			// The controller also returns the whole `TodoView`, which the model never reads.
			async (input) => projectTodoWrite((await controllers.todos().update(actor, input)).todo)
		)
	});
	const diagrams = () => ({
		revise_mermaid_diagram: defineTool(
			'revise_mermaid_diagram',
			'mutation',
			agentToolInputSchemas.revise_mermaid_diagram,
			async (input) => controllers.diagrams().reviseMermaid(actor, input)
		),
		search_icons: defineTool(
			'search_icons',
			'read',
			agentToolInputSchemas.search_icons,
			async (input) => controllers.diagramStudio().searchDiagramIcons(actor, input)
		),
		read_project_diagram: defineTool(
			'read_project_diagram',
			'read',
			agentToolInputSchemas.read_project_diagram,
			async (input) =>
				diagramFile(await controllers.diagramStudio().readProjectDiagram(actor, input))
		),
		promote_diagram: defineTool(
			'promote_diagram',
			'proposal',
			agentToolInputSchemas.promote_diagram,
			async (input) => controllers.diagrams().promote(actor, input)
		)
	});
	const suggestions = () => ({
		list_suggestions: defineTool(
			'list_suggestions',
			'read',
			agentToolInputSchemas.list_suggestions,
			async (input) => ({
				suggestions: (await controllers.suggestions().list(actor, input)).groups.flatMap((group) =>
					group.suggestions.map((view) => projectSuggestion(view.suggestion))
				)
			})
		),
		accept_suggestion: defineTool(
			'accept_suggestion',
			'mutation',
			agentToolInputSchemas.accept_suggestion,
			// `acceptReviewed`, not `accept`: a draw.io diagram accepted without its
			// review has no preview and can never gain one, and that guard lives in
			// `acceptReviewed`. Bound to the raw `accept`, this tool was the one
			// caller in the system that could mint a preview-less diagram. For every
			// other kind of suggestion the two are the same call.
			async (input) => controllers.suggestions().acceptReviewed(actor, input)
		),
		reject_suggestion: defineTool(
			'reject_suggestion',
			'mutation',
			agentToolInputSchemas.reject_suggestion,
			async (input) => controllers.suggestions().reject(actor, input)
		),
		revert_suggestion: defineTool(
			'revert_suggestion',
			'mutation',
			agentToolInputSchemas.revert_suggestion,
			async (input) => controllers.suggestions().revert(actor, input)
		)
	});
	const skills = () => ({
		list_skills: defineTool('list_skills', 'read', agentToolInputSchemas.list_skills, async () =>
			controllers.skills().list(actor)
		),
		save_skill: defineNoteChangeTool(
			controllers,
			actor,
			'save_skill',
			agentToolInputSchemas.save_skill,
			{
				kind: 'replace',
				target: 'skill'
			}
		),
		edit_skill: defineNoteChangeTool(
			controllers,
			actor,
			'edit_skill',
			agentToolInputSchemas.edit_skill,
			{
				kind: 'patch',
				target: 'skill'
			}
		),
		create_skill: defineTool(
			'create_skill',
			'mutation',
			agentToolInputSchemas.create_skill,
			async (input) => controllers.skills().create(actor, input)
		),
		list_skill_versions: defineTool(
			'list_skill_versions',
			'read',
			agentToolInputSchemas.list_skill_versions,
			async (input) => ({
				revisions: (await controllers.skills().listVersions(actor, input)).map(projectNoteRevision)
			})
		),
		restore_skill_version: defineTool(
			'restore_skill_version',
			'mutation',
			agentToolInputSchemas.restore_skill_version,
			async (input) => controllers.skills().restoreVersion(actor, input)
		),
		update_skill: defineTool(
			'update_skill',
			'mutation',
			agentToolInputSchemas.update_skill,
			async (input) => controllers.skills().update(actor, input)
		),
		set_skill_pinned: defineTool(
			'set_skill_pinned',
			'mutation',
			agentToolInputSchemas.set_skill_pinned,
			async (input) => {
				await controllers.skills().setPinned(actor, input);
				return input;
			}
		)
	});
	const account = () => ({
		list_api_tokens: defineTool(
			'list_api_tokens',
			'read',
			agentToolInputSchemas.list_api_tokens,
			async () => controllers.apiTokens().list(actor)
		),
		revoke_api_token: defineTool(
			'revoke_api_token',
			'mutation',
			agentToolInputSchemas.revoke_api_token,
			async (input) => revokedToken(await controllers.apiTokens().revoke(actor, input.tokenId))
		),
		list_attachments: defineTool(
			'list_attachments',
			'read',
			agentToolInputSchemas.list_attachments,
			async (input) => controllers.attachments().list(actor, input.noteId as NoteId)
		)
	});
	const memoryAndPreferences = () => ({
		list_project_memory: defineTool(
			'list_project_memory',
			'read',
			agentToolInputSchemas.list_project_memory,
			async (input) => ({
				entries: (
					await controllers
						.memory()
						.list(actor, { projectId: input.projectId as ProjectId, sharedOnly: true })
				).entries.map(projectMemory)
			})
		),
		list_user_memory: defineTool(
			'list_user_memory',
			'read',
			agentToolInputSchemas.list_user_memory,
			async () => ({
				entries: (await controllers.memory().list(actor, { sharedOnly: true })).entries.map(
					projectMemory
				)
			})
		),
		propose_memory_change: defineTool(
			'propose_memory_change',
			'proposal',
			agentToolInputSchemas.propose_memory_change,
			async (input) => {
				const { confidence, ...proposal } = readMemoryProposal(input);
				return controllers.memory().propose(actor, {
					...proposal,
					provenanceId,
					...(confidence !== undefined ? { confidence } : {})
				});
			}
		),
		list_trust_policies: defineTool(
			'list_trust_policies',
			'read',
			agentToolInputSchemas.list_trust_policies,
			async () => controllers.trustPolicies().list(actor)
		),
		update_trust_policy: defineTool(
			'update_trust_policy',
			'mutation',
			agentToolInputSchemas.update_trust_policy,
			async (input) => controllers.trustPolicies().update(actor, input)
		),
		list_tool_preferences: defineTool(
			'list_tool_preferences',
			'read',
			agentToolInputSchemas.list_tool_preferences,
			async (input) =>
				controllers
					.toolPreferences()
					.list(actor, input.projectId ? { projectId: input.projectId as ProjectId } : {})
		),
		set_tool_enabled: defineTool(
			'set_tool_enabled',
			'mutation',
			agentToolInputSchemas.set_tool_enabled,
			async (input) =>
				controllers.toolPreferences().setEnabled(actor, {
					toolName: input.toolName,
					enabled: input.enabled,
					...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
				})
		),
		get_agent_preferences: defineTool(
			'get_agent_preferences',
			'read',
			agentToolInputSchemas.get_agent_preferences,
			async () => controllers.agentSettings().getPreferences(actor)
		),
		update_agent_preferences: defineTool(
			'update_agent_preferences',
			'mutation',
			agentToolInputSchemas.update_agent_preferences,
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
			async (input) => controllers.agentSettings().changePreferences(actor, input)
		),
		list_agent_models: defineTool(
			'list_agent_models',
			'read',
			agentToolInputSchemas.list_agent_models,
			async () => controllers.agentSettings().listModels(actor)
		)
	});
	const deliverables = () => ({
		export_document: defineTool(
			'export_document',
			'mutation',
			agentToolInputSchemas.export_document,
			async (input) =>
				controllers.deliverables().generateDocument(actor, {
					projectId: input.projectId as ProjectId,
					noteIds: input.noteIds.map((noteId) => noteId as NoteId),
					title: input.title,
					format: input.format,
					...(input.templateId ? { templateId: input.templateId as TemplateId } : {})
				})
		),
		list_artifacts: defineTool(
			'list_artifacts',
			'read',
			agentToolInputSchemas.list_artifacts,
			async (input) => controllers.deliverables().listArtifacts(actor, input.projectId)
		),
		list_templates: defineTool(
			'list_templates',
			'read',
			agentToolInputSchemas.list_templates,
			async (input) => controllers.deliverables().listTemplates(actor, input.projectId)
		),
		get_export_settings: defineTool(
			'get_export_settings',
			'read',
			agentToolInputSchemas.get_export_settings,
			async (input) => controllers.deliverables().getExportSettings(actor, input.projectId)
		),
		update_export_settings: defineTool(
			'update_export_settings',
			'mutation',
			agentToolInputSchemas.update_export_settings,
			async (input) =>
				controllers
					.deliverables()
					.updateExportSettings(actor, input.projectId, exportSettings(input))
		),
		get_artifact: defineTool(
			'get_artifact',
			'read',
			agentToolInputSchemas.get_artifact,
			async (input) =>
				foundArtifact(await controllers.deliverables().getArtifact(actor, input.artifactId))
		),
		download_artifact: defineTool(
			'download_artifact',
			'read',
			agentToolInputSchemas.download_artifact,
			async (input) => controllers.deliverables().downloadArtifact(actor, input.artifactId)
		),
		delete_artifact: defineTool(
			'delete_artifact',
			'mutation',
			agentToolInputSchemas.delete_artifact,
			async (input) =>
				deletedArtifact(await controllers.deliverables().deleteArtifact(actor, input.artifactId))
		),
		regenerate_artifact: defineTool(
			'regenerate_artifact',
			'mutation',
			agentToolInputSchemas.regenerate_artifact,
			async (input) => controllers.deliverables().regenerateArtifact(actor, input.artifactId)
		)
	});
	const widgets = () => ({
		read_widget_catalog: defineTool(
			'read_widget_catalog',
			'read',
			agentToolInputSchemas.read_widget_catalog,
			async () => controllers.widgets().catalog(actor)
		),
		create_widget: defineTool(
			'create_widget',
			'mutation',
			agentToolInputSchemas.create_widget,
			async (input) => {
				const creation = readWidgetCreation(input);
				if (creation.draft.kind === 'failure') throw creation.draft.error;
				const { widget } = await controllers.widgets().create(actor, {
					id: crypto.randomUUID() as WidgetId,
					...(creation.projectId ? { projectId: creation.projectId } : {}),
					draft: creation.draft.draft
				});
				return createdWidget(widget, creation.noteId);
			}
		),
		list_widgets: defineTool(
			'list_widgets',
			'read',
			agentToolInputSchemas.list_widgets,
			async (input) => ({
				widgets: (await controllers.widgets().list(actor, input)).widgets.map((widget) => ({
					widgetId: widget.id,
					title: widget.title,
					updatedAt: widget.updatedAt
				}))
			})
		),
		read_widget: defineTool(
			'read_widget',
			'read',
			agentToolInputSchemas.read_widget,
			async (input) => controllers.widgets().get(actor, input)
		),
		edit_widget_data: defineTool(
			'edit_widget_data',
			'mutation',
			agentToolInputSchemas.edit_widget_data,
			async (input) => {
				const edit = readWidgetDataEdit(input);
				return controllers.widgets().edit(actor, {
					widgetId: edit.widgetId,
					edit: { kind: 'data', expectedDataRevision: edit.expectedDataRevision, patch: edit.patch }
				});
			}
		),
		edit_widget_layout: defineTool(
			'edit_widget_layout',
			'mutation',
			agentToolInputSchemas.edit_widget_layout,
			async (input) => {
				const edit = readWidgetLayoutEdit(input);
				return controllers.widgets().edit(actor, {
					widgetId: edit.widgetId,
					edit: {
						kind: 'layout',
						expectedLayoutRevision: edit.expectedLayoutRevision,
						patch: edit.patch
					}
				});
			}
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
		...deliverables(),
		...widgets()
	};
};
const selectionToolDefinitions = (
	controllers: ControllerFactory,
	actor: ActorContext,
	selection: TextSelection,
	model: string
) => ({
	extract_promises: defineTool(
		'extract_promises',
		'proposal',
		agentToolInputSchemas.extract_promises,
		async (input) => ({
			...(await controllers.todos().extractPromises(actor, {
				selection,
				...(input.responsibility ? { responsibility: input.responsibility } : {})
			})),
			sourceNoteId: selection.noteId
		})
	),
	relate_selection: defineTool(
		'relate_selection',
		'proposal',
		agentToolInputSchemas.relate_selection,
		async () => ({
			...(await controllers.relationships().suggestFromSelection(actor, { selection })),
			sourceNoteId: selection.noteId
		})
	),
	find_references: defineTool(
		'find_references',
		'proposal',
		agentToolInputSchemas.find_references,
		async () => ({
			...(await controllers.references().suggestFromSelection(actor, { selection }, { model })),
			sourceNoteId: selection.noteId
		})
	),
	create_skill_from_selection: defineTool(
		'create_skill_from_selection',
		'mutation',
		agentToolInputSchemas.create_skill_from_selection,
		async (input) => ({
			...(await controllers.skills().createFromSelection(actor, { ...input, selection })),
			sourceNoteId: selection.noteId
		})
	)
});
const appToolDefinitions = (
	controllers: ControllerFactory,
	actor: ActorContext,
	context: AgentToolContext
) => {
	return {
		load_skill: defineTool('load_skill', 'read', agentToolInputSchemas.load_skill, async (input) =>
			skillView(
				await controllers.skills().use(actor, {
					noteId: input.noteId as NoteId,
					provenanceId: context.provenanceId,
					...(context.input.noteId ? { contextNoteId: context.input.noteId } : {})
				})
			)
		),
		create_diagram: defineTool(
			'create_diagram',
			'mutation',
			// `projectId` is optional here and required on `CreateDiagramInput`, for the
			// reason `create_note` is: a bare schema rejection would tell the model only
			// that a field is missing, and `requireProject` names the projects instead.
			agentToolInputSchemas.create_diagram,
			async (input) =>
				controllers.diagramStudio().createDiagram(actor, {
					source: input.source,
					projectId: input.projectId,
					conversationId: context.input.conversationId,
					...(input.title === undefined ? {} : { title: input.title })
				})
		),
		edit_diagram: defineTool(
			'edit_diagram',
			'mutation',
			agentToolInputSchemas.edit_diagram,
			async (input) => controllers.diagramStudio().editDiagram(actor, input)
		),
		read_canvas_diagram: defineTool(
			'read_canvas_diagram',
			'read',
			agentToolInputSchemas.read_canvas_diagram,
			async () =>
				controllers
					.diagramStudio()
					.readCanvasDiagram(actor, { conversationId: context.input.conversationId })
		)
	};
};
const mcpOnlyDefinitions = (
	controllers: ControllerFactory,
	actor: ActorContext,
	context: McpToolContext
) => ({
	load_skill: defineTool('load_skill', 'read', agentToolInputSchemas.load_skill, async (input) =>
		skillView(
			await controllers
				.skills()
				.use(actor, { noteId: input.noteId as NoteId, provenanceId: context.provenanceId })
		)
	)
});
type BuiltToolName =
	| keyof ReturnType<typeof sharedToolDefinitions>
	| keyof ReturnType<typeof selectionToolDefinitions>
	| keyof ReturnType<typeof appToolDefinitions>
	| keyof ReturnType<typeof mcpOnlyDefinitions>;
type Total<T extends never> = T;
type _BuildersCoverCatalog = Total<Exclude<ToolName, BuiltToolName>>;
type _BuildersNameNothingElse = Total<Exclude<BuiltToolName, ToolName>>;

/** Every tool of an in-app agent run: the selection tools exist only for a run with a selection. */
export const createAgentTools = (
	controllers: ControllerFactory,
	actor: ActorContext,
	context: AgentToolContext
): readonly AgentTool[] => [
	...Object.values(sharedToolDefinitions(controllers, actor, context.provenanceId)),
	...Object.values(appToolDefinitions(controllers, actor, context)),
	...(context.input.selection
		? Object.values(
				selectionToolDefinitions(controllers, actor, context.input.selection, context.model)
			)
		: [])
];

/** Every tool an MCP client can reach. */
export const createMcpTools = (
	controllers: ControllerFactory,
	actor: ActorContext,
	context: McpToolContext
): readonly AgentTool[] => [
	...Object.values(sharedToolDefinitions(controllers, actor, context.provenanceId)),
	...Object.values(mcpOnlyDefinitions(controllers, actor, context))
];
