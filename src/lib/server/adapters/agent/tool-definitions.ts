import type { ToolClassification } from '$lib/models/agent';
import type { AgentToolContext, McpToolContext } from '$lib/models/agent-tool-context';
import { agentToolInputSchemas } from '$lib/models/agent-tool-inputs';
import type { PreparedAction } from '$lib/models/agent-tool-protocol';
import type { AgentPayload } from '$lib/models/agent/payload';
import { TOOL_DESCRIPTIONS, type ToolName } from '$lib/models/agent/tool-catalog';
import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { z } from 'zod';
import { bindToolArguments } from './tool-call';
import {
	readMemoryProposal,
	readWidgetCreation,
	readWidgetDataEdit,
	readWidgetLayoutEdit
} from './tool-inputs';

export interface AgentToolDefinition {
	readonly name: ToolName;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
	readonly prepare: (input: unknown) => PreparedAction;
}

type Definition = AgentToolDefinition;
const defineTool = <Name extends ToolName, Shape extends z.ZodRawShape>(
	name: Name,
	classification: Definition['classification'],
	parameters: z.ZodObject<Shape>,
	execute: (input: z.infer<z.ZodObject<Shape>>) => Promise<AgentPayload>
): Definition => {
	const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
	const strictParameters = parameters.strict();
	return {
		name,
		description: entry.description,
		classification,
		parameters: strictParameters,
		prepare: (input) => bindToolArguments(parameters, input, execute)
	};
};

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
			async (input) => await controllers.agentFiles().agentLs(actor, input)
		),
		grep: defineTool(
			'grep',
			'read',
			agentToolInputSchemas.grep,
			async (input) => await controllers.agentFiles().agentGrep(actor, input)
		),
		sed: defineTool(
			'sed',
			'read',
			agentToolInputSchemas.sed,
			async (input) => await controllers.agentFiles().agentSed(actor, input)
		),
		search: defineTool('search', 'read', agentToolInputSchemas.search, (input) =>
			controllers.retrieval().agentSearch(actor, input)
		),
		search_note: defineTool('search_note', 'read', agentToolInputSchemas.search_note, (input) =>
			controllers.retrieval().agentSearchNote(actor, input)
		),
		get_workspace_context: defineTool(
			'get_workspace_context',
			'read',
			agentToolInputSchemas.get_workspace_context,
			(input) => controllers.workspace().agentGetWorkspaceContext(actor, input)
		),
		get_today_view: defineTool(
			'get_today_view',
			'read',
			agentToolInputSchemas.get_today_view,
			(input) => controllers.workspace().agentGetTodayView(actor, input)
		)
	});
	const projects = () => ({
		list_projects: defineTool(
			'list_projects',
			'read',
			agentToolInputSchemas.list_projects,
			(input) => controllers.projects().agentListProjects(actor, input)
		),
		get_project: defineTool('get_project', 'read', agentToolInputSchemas.get_project, (input) =>
			controllers.projects().agentGetProject(actor, input)
		),
		create_project: defineTool(
			'create_project',
			'mutation',
			agentToolInputSchemas.create_project,
			(input) => controllers.projects().agentCreateProject(actor, input)
		),
		rename_project: defineTool(
			'rename_project',
			'mutation',
			agentToolInputSchemas.rename_project,
			(input) => controllers.projects().agentRenameProject(actor, input)
		),
		archive_project: defineTool(
			'archive_project',
			'mutation',
			agentToolInputSchemas.archive_project,
			(input) => controllers.projects().agentArchiveProject(actor, input)
		),
		create_folder: defineTool(
			'create_folder',
			'mutation',
			agentToolInputSchemas.create_folder,
			// A folder is a note, so it takes the note write projection rather than shipping a
			// (necessarily empty) ProseMirror document with it.
			(input) => controllers.projects().agentCreateFolder(actor, input)
		),
		move_project_entry: defineTool(
			'move_project_entry',
			'mutation',
			agentToolInputSchemas.move_project_entry,
			(input) => controllers.projects().agentMoveProjectEntry(actor, input)
		)
	});
	const notes = () => ({
		get_note: defineTool('get_note', 'read', agentToolInputSchemas.get_note, (input) =>
			controllers.notes().agentGetNote(actor, input)
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
			(input) => controllers.notes().agentCreateNote(actor, input)
		),
		save_note: defineTool('save_note', 'mutation', agentToolInputSchemas.save_note, (input) =>
			controllers.notes().agentSaveNote(actor, input)
		),
		edit_note: defineTool('edit_note', 'mutation', agentToolInputSchemas.edit_note, (input) =>
			controllers.notes().agentEditNote(actor, input)
		),
		rename_note: defineTool('rename_note', 'mutation', agentToolInputSchemas.rename_note, (input) =>
			controllers.notes().agentRenameNote(actor, input)
		),
		archive_note: defineTool(
			'archive_note',
			'mutation',
			agentToolInputSchemas.archive_note,
			(input) => controllers.notes().agentArchiveNote(actor, input)
		),
		restore_note: defineTool(
			'restore_note',
			'mutation',
			agentToolInputSchemas.restore_note,
			(input) => controllers.notes().agentRestoreNote(actor, input)
		),
		list_trashed_notes: defineTool(
			'list_trashed_notes',
			'read',
			agentToolInputSchemas.list_trashed_notes,
			(input) => controllers.notes().agentListTrashedNotes(actor, input)
		),
		delete_note_forever: defineTool(
			'delete_note_forever',
			'mutation',
			agentToolInputSchemas.delete_note_forever,
			(input) => controllers.notes().agentDeleteNoteForever(actor, input)
		),
		empty_note_trash: defineTool(
			'empty_note_trash',
			'mutation',
			agentToolInputSchemas.empty_note_trash,
			(input) => controllers.notes().agentEmptyNoteTrash(actor, input)
		),
		list_note_versions: defineTool(
			'list_note_versions',
			'read',
			agentToolInputSchemas.list_note_versions,
			(input) => controllers.notes().agentListNoteVersions(actor, input)
		),
		diff_note_versions: defineTool(
			'diff_note_versions',
			'read',
			agentToolInputSchemas.diff_note_versions,
			(input) => controllers.notes().agentDiffNoteVersions(actor, input)
		),
		restore_note_version: defineTool(
			'restore_note_version',
			'mutation',
			agentToolInputSchemas.restore_note_version,
			(input) => controllers.notes().agentRestoreNoteVersion(actor, input)
		),
		publish_note: defineTool(
			'publish_note',
			'mutation',
			agentToolInputSchemas.publish_note,
			(input) => controllers.notes().agentPublishNote(actor, input)
		),
		discard_note_draft: defineTool(
			'discard_note_draft',
			'mutation',
			agentToolInputSchemas.discard_note_draft,
			(input) => controllers.notes().agentDiscardNoteDraft(actor, input)
		)
	});
	const todos = () => ({
		list_todos: defineTool('list_todos', 'read', agentToolInputSchemas.list_todos, (input) =>
			controllers.todos().agentListTodos(actor, input)
		),
		create_todo: defineTool('create_todo', 'mutation', agentToolInputSchemas.create_todo, (input) =>
			controllers.todos().agentCreateTodo(actor, input)
		),
		create_todos: defineTool(
			'create_todos',
			'mutation',
			agentToolInputSchemas.create_todos,
			(input) => controllers.todos().agentCreateTodos(actor, input)
		),
		update_todo: defineTool(
			'update_todo',
			'mutation',
			agentToolInputSchemas.update_todo,
			// The controller also returns the whole `TodoView`, which the model never reads.
			(input) => controllers.todos().agentUpdateTodo(actor, input)
		)
	});
	const diagrams = () => ({
		revise_mermaid_diagram: defineTool(
			'revise_mermaid_diagram',
			'mutation',
			agentToolInputSchemas.revise_mermaid_diagram,
			(input) => controllers.diagrams().agentReviseMermaidDiagram(actor, input)
		),
		search_icons: defineTool('search_icons', 'read', agentToolInputSchemas.search_icons, (input) =>
			controllers.diagramStudio().agentSearchIcons(actor, input)
		),
		read_project_diagram: defineTool(
			'read_project_diagram',
			'read',
			agentToolInputSchemas.read_project_diagram,
			(input) => controllers.diagramStudio().agentReadProjectDiagram(actor, input)
		),
		promote_diagram: defineTool(
			'promote_diagram',
			'proposal',
			agentToolInputSchemas.promote_diagram,
			(input) => controllers.diagrams().agentPromoteDiagram(actor, input)
		)
	});
	const suggestions = () => ({
		list_suggestions: defineTool(
			'list_suggestions',
			'read',
			agentToolInputSchemas.list_suggestions,
			(input) => controllers.suggestions().agentListSuggestions(actor, input)
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
			(input) => controllers.suggestions().agentAcceptSuggestion(actor, input)
		),
		reject_suggestion: defineTool(
			'reject_suggestion',
			'mutation',
			agentToolInputSchemas.reject_suggestion,
			(input) => controllers.suggestions().agentRejectSuggestion(actor, input)
		),
		revert_suggestion: defineTool(
			'revert_suggestion',
			'mutation',
			agentToolInputSchemas.revert_suggestion,
			(input) => controllers.suggestions().agentRevertSuggestion(actor, input)
		)
	});
	const skills = () => ({
		list_skills: defineTool('list_skills', 'read', agentToolInputSchemas.list_skills, (input) =>
			controllers.skills().agentListSkills(actor, input)
		),
		save_skill: defineTool('save_skill', 'mutation', agentToolInputSchemas.save_skill, (input) =>
			controllers.notes().agentSaveSkill(actor, input)
		),
		edit_skill: defineTool('edit_skill', 'mutation', agentToolInputSchemas.edit_skill, (input) =>
			controllers.notes().agentEditSkill(actor, input)
		),
		create_skill: defineTool(
			'create_skill',
			'mutation',
			agentToolInputSchemas.create_skill,
			(input) => controllers.skills().agentCreateSkill(actor, input)
		),
		list_skill_versions: defineTool(
			'list_skill_versions',
			'read',
			agentToolInputSchemas.list_skill_versions,
			(input) => controllers.skills().agentListSkillVersions(actor, input)
		),
		restore_skill_version: defineTool(
			'restore_skill_version',
			'mutation',
			agentToolInputSchemas.restore_skill_version,
			(input) => controllers.skills().agentRestoreSkillVersion(actor, input)
		),
		update_skill: defineTool(
			'update_skill',
			'mutation',
			agentToolInputSchemas.update_skill,
			(input) => controllers.skills().agentUpdateSkill(actor, input)
		),
		set_skill_pinned: defineTool(
			'set_skill_pinned',
			'mutation',
			agentToolInputSchemas.set_skill_pinned,
			(input) => controllers.skills().agentSetSkillPinned(actor, input)
		)
	});
	const account = () => ({
		list_api_tokens: defineTool(
			'list_api_tokens',
			'read',
			agentToolInputSchemas.list_api_tokens,
			(input) => controllers.apiTokens().agentListApiTokens(actor, input)
		),
		revoke_api_token: defineTool(
			'revoke_api_token',
			'mutation',
			agentToolInputSchemas.revoke_api_token,
			(input) => controllers.apiTokens().agentRevokeApiToken(actor, input)
		),
		list_attachments: defineTool(
			'list_attachments',
			'read',
			agentToolInputSchemas.list_attachments,
			(input) => controllers.attachments().agentListAttachments(actor, input)
		)
	});
	const memoryAndPreferences = () => ({
		list_project_memory: defineTool(
			'list_project_memory',
			'read',
			agentToolInputSchemas.list_project_memory,
			(input) => controllers.memory().agentListProjectMemory(actor, input)
		),
		list_user_memory: defineTool(
			'list_user_memory',
			'read',
			agentToolInputSchemas.list_user_memory,
			(input) => controllers.memory().agentListUserMemory(actor, input)
		),
		propose_memory_change: defineTool(
			'propose_memory_change',
			'proposal',
			agentToolInputSchemas.propose_memory_change,
			(input) =>
				controllers
					.memory()
					.agentProposeMemoryChange(actor, provenanceId, readMemoryProposal(input))
		),
		list_trust_policies: defineTool(
			'list_trust_policies',
			'read',
			agentToolInputSchemas.list_trust_policies,
			(input) => controllers.trustPolicies().agentListTrustPolicies(actor, input)
		),
		update_trust_policy: defineTool(
			'update_trust_policy',
			'mutation',
			agentToolInputSchemas.update_trust_policy,
			(input) => controllers.trustPolicies().agentUpdateTrustPolicy(actor, input)
		),
		list_tool_preferences: defineTool(
			'list_tool_preferences',
			'read',
			agentToolInputSchemas.list_tool_preferences,
			(input) => controllers.toolPreferences().agentListToolPreferences(actor, input)
		),
		set_tool_enabled: defineTool(
			'set_tool_enabled',
			'mutation',
			agentToolInputSchemas.set_tool_enabled,
			(input) => controllers.toolPreferences().agentSetToolEnabled(actor, input)
		),
		get_agent_preferences: defineTool(
			'get_agent_preferences',
			'read',
			agentToolInputSchemas.get_agent_preferences,
			(input) => controllers.agentSettings().agentGetAgentPreferences(actor, input)
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
			(input) => controllers.agentSettings().agentUpdateAgentPreferences(actor, input)
		),
		list_agent_models: defineTool(
			'list_agent_models',
			'read',
			agentToolInputSchemas.list_agent_models,
			(input) => controllers.agentSettings().agentListAgentModels(actor, input)
		)
	});
	const deliverables = () => ({
		export_document: defineTool(
			'export_document',
			'mutation',
			agentToolInputSchemas.export_document,
			(input) => controllers.deliverables().agentExportDocument(actor, input)
		),
		list_artifacts: defineTool(
			'list_artifacts',
			'read',
			agentToolInputSchemas.list_artifacts,
			(input) => controllers.deliverables().agentListArtifacts(actor, input)
		),
		list_templates: defineTool(
			'list_templates',
			'read',
			agentToolInputSchemas.list_templates,
			(input) => controllers.deliverables().agentListTemplates(actor, input)
		),
		get_export_settings: defineTool(
			'get_export_settings',
			'read',
			agentToolInputSchemas.get_export_settings,
			(input) => controllers.deliverables().agentGetExportSettings(actor, input)
		),
		update_export_settings: defineTool(
			'update_export_settings',
			'mutation',
			agentToolInputSchemas.update_export_settings,
			(input) => controllers.deliverables().agentUpdateExportSettings(actor, input)
		),
		get_artifact: defineTool('get_artifact', 'read', agentToolInputSchemas.get_artifact, (input) =>
			controllers.deliverables().agentGetArtifact(actor, input)
		),
		download_artifact: defineTool(
			'download_artifact',
			'read',
			agentToolInputSchemas.download_artifact,
			(input) => controllers.deliverables().agentDownloadArtifact(actor, input)
		),
		delete_artifact: defineTool(
			'delete_artifact',
			'mutation',
			agentToolInputSchemas.delete_artifact,
			(input) => controllers.deliverables().agentDeleteArtifact(actor, input)
		),
		regenerate_artifact: defineTool(
			'regenerate_artifact',
			'mutation',
			agentToolInputSchemas.regenerate_artifact,
			(input) => controllers.deliverables().agentRegenerateArtifact(actor, input)
		)
	});
	const widgets = () => ({
		read_widget_catalog: defineTool(
			'read_widget_catalog',
			'read',
			agentToolInputSchemas.read_widget_catalog,
			(input) => controllers.widgets().agentReadWidgetCatalog(actor, input)
		),
		create_widget: defineTool(
			'create_widget',
			'mutation',
			agentToolInputSchemas.create_widget,
			(input) => controllers.widgets().agentCreateWidget(actor, readWidgetCreation(input))
		),
		list_widgets: defineTool('list_widgets', 'read', agentToolInputSchemas.list_widgets, (input) =>
			controllers.widgets().agentListWidgets(actor, input)
		),
		read_widget: defineTool('read_widget', 'read', agentToolInputSchemas.read_widget, (input) =>
			controllers.widgets().agentReadWidget(actor, input)
		),
		edit_widget_data: defineTool(
			'edit_widget_data',
			'mutation',
			agentToolInputSchemas.edit_widget_data,
			(input) => controllers.widgets().agentEditWidgetData(actor, readWidgetDataEdit(input))
		),
		edit_widget_layout: defineTool(
			'edit_widget_layout',
			'mutation',
			agentToolInputSchemas.edit_widget_layout,
			(input) => controllers.widgets().agentEditWidgetLayout(actor, readWidgetLayoutEdit(input))
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
		(input) => controllers.todos().agentExtractPromises(actor, selection, input)
	),
	relate_selection: defineTool(
		'relate_selection',
		'proposal',
		agentToolInputSchemas.relate_selection,
		(input) => controllers.relationships().agentRelateSelection(actor, selection, input)
	),
	find_references: defineTool(
		'find_references',
		'proposal',
		agentToolInputSchemas.find_references,
		(input) => controllers.references().agentFindReferences(actor, selection, model, input)
	),
	create_skill_from_selection: defineTool(
		'create_skill_from_selection',
		'mutation',
		agentToolInputSchemas.create_skill_from_selection,
		(input) => controllers.skills().agentCreateSkillFromSelection(actor, selection, input)
	)
});
const appToolDefinitions = (
	controllers: ControllerFactory,
	actor: ActorContext,
	context: AgentToolContext
) => {
	return {
		load_skill: defineTool('load_skill', 'read', agentToolInputSchemas.load_skill, (input) =>
			controllers.skills().agentLoadSkill(
				actor,
				{
					provenanceId: context.provenanceId,
					...(context.input.noteId ? { contextNoteId: context.input.noteId } : {})
				},
				input
			)
		),
		create_diagram: defineTool(
			'create_diagram',
			'mutation',
			// `projectId` is optional here and required on `CreateDiagramInput`, for the
			// reason `create_note` is: a bare schema rejection would tell the model only
			// that a field is missing, and `requireProject` names the projects instead.
			agentToolInputSchemas.create_diagram,
			(input) => controllers.diagramStudio().agentCreateDiagram(actor, context, input)
		),
		edit_diagram: defineTool(
			'edit_diagram',
			'mutation',
			agentToolInputSchemas.edit_diagram,
			(input) => controllers.diagramStudio().agentEditDiagram(actor, input)
		),
		read_canvas_diagram: defineTool(
			'read_canvas_diagram',
			'read',
			agentToolInputSchemas.read_canvas_diagram,
			(input) => controllers.diagramStudio().agentReadCanvasDiagram(actor, context, input)
		)
	};
};
const mcpOnlyDefinitions = (
	controllers: ControllerFactory,
	actor: ActorContext,
	context: McpToolContext
) => ({
	load_skill: defineTool('load_skill', 'read', agentToolInputSchemas.load_skill, (input) =>
		controllers.skills().agentLoadSkill(actor, { provenanceId: context.provenanceId }, input)
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

/** Schemas and one complete application operation per tool. */
export class SharedToolDefinitions {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly provenanceId: ProvenanceId
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(sharedToolDefinitions(this.controllers, this.actor, this.provenanceId));
	}
}
export class AppToolDefinitions {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly context: AgentToolContext
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(appToolDefinitions(this.controllers, this.actor, this.context));
	}
}
export class SelectionToolDefinitions {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly selection: TextSelection,
		private readonly model: string
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(
			selectionToolDefinitions(this.controllers, this.actor, this.selection, this.model)
		);
	}
}
export class McpToolDefinitions {
	constructor(
		private readonly controllers: ControllerFactory,
		private readonly actor: ActorContext,
		private readonly context: McpToolContext
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(mcpOnlyDefinitions(this.controllers, this.actor, this.context));
	}
}
