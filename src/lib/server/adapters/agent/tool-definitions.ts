import type { AgentReadToolController } from '$lib/server/controllers/agent/read-tool';
import type { ToolClassification } from '$lib/models/agent';
import { agentToolInputSchemas } from '$lib/models/agent-tool-inputs';
import { TOOL_DESCRIPTIONS, type ToolName } from '$lib/models/agent/tool-catalog';
import type { PreparedAction } from '$lib/server/controllers/agent/tool-calls';
import type {
	AppToolOperationsSet,
	McpToolOperationsSet,
	SelectionToolOperationsSet,
	SharedToolOperations
} from '$lib/server/controllers/agent/tool-operations/contracts';
import type { AgentToolOutput } from '$lib/server/controllers/agent/tool-outputs';
import { BoundReadTool } from './read-tool';
import { z } from 'zod';
import {
	readMemoryProposal,
	readWidgetCreation,
	readWidgetDataEdit,
	readWidgetLayoutEdit
} from './tool-inputs';
import { projectFileResult } from './tool-result-projectors';

export interface AgentToolDefinition {
	readonly name: ToolName;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
	readonly prepare: (input: unknown) => PreparedAction;
}
export interface ReadToolConstruction {
	<Input, Result>(execute: (input: Input) => Promise<Result>): AgentReadToolController<Input>;
}
type Definition = AgentToolDefinition;
const defineTool = <Name extends ToolName, Shape extends z.ZodRawShape>(
	constructReadTool: ReadToolConstruction,
	name: Name,
	classification: Definition['classification'],
	parameters: z.ZodObject<Shape>,
	execute: (input: z.infer<z.ZodObject<Shape>>) => Promise<AgentToolOutput<Name>>
): Definition => {
	const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
	const strictParameters = parameters.strict();
	return {
		name,
		description: entry.description,
		classification,
		parameters: strictParameters,
		prepare: new BoundReadTool(parameters, constructReadTool(execute)).prepare
	};
};

const sharedToolDefinitions = (
	constructReadTool: ReadToolConstruction,
	operations: SharedToolOperations
) => {
	const retrieval = () => ({
		ls: defineTool(constructReadTool, 'ls', 'read', agentToolInputSchemas.ls, async (input) =>
			projectFileResult(await operations.retrieval.ls(input))
		),
		grep: defineTool(constructReadTool, 'grep', 'read', agentToolInputSchemas.grep, async (input) =>
			projectFileResult(await operations.retrieval.grep(input))
		),
		sed: defineTool(constructReadTool, 'sed', 'read', agentToolInputSchemas.sed, async (input) =>
			projectFileResult(await operations.retrieval.sed(input))
		),
		search: defineTool(constructReadTool, 'search', 'read', agentToolInputSchemas.search, (input) =>
			operations.retrieval.search(input)
		),
		search_note: defineTool(
			constructReadTool,
			'search_note',
			'read',
			agentToolInputSchemas.search_note,
			(input) => operations.retrieval.search_note(input)
		),
		get_workspace_context: defineTool(
			constructReadTool,
			'get_workspace_context',
			'read',
			agentToolInputSchemas.get_workspace_context,
			() => operations.retrieval.get_workspace_context()
		),
		get_today_view: defineTool(
			constructReadTool,
			'get_today_view',
			'read',
			agentToolInputSchemas.get_today_view,
			(input) => operations.retrieval.get_today_view(input)
		)
	});
	const projects = () => ({
		list_projects: defineTool(
			constructReadTool,
			'list_projects',
			'read',
			agentToolInputSchemas.list_projects,
			() => operations.projects.list_projects()
		),
		get_project: defineTool(
			constructReadTool,
			'get_project',
			'read',
			agentToolInputSchemas.get_project,
			(input) => operations.projects.get_project(input)
		),
		create_project: defineTool(
			constructReadTool,
			'create_project',
			'mutation',
			agentToolInputSchemas.create_project,
			(input) => operations.projects.create_project(input)
		),
		rename_project: defineTool(
			constructReadTool,
			'rename_project',
			'mutation',
			agentToolInputSchemas.rename_project,
			(input) => operations.projects.rename_project(input)
		),
		archive_project: defineTool(
			constructReadTool,
			'archive_project',
			'mutation',
			agentToolInputSchemas.archive_project,
			(input) => operations.projects.archive_project(input)
		),
		create_folder: defineTool(
			constructReadTool,
			'create_folder',
			'mutation',
			agentToolInputSchemas.create_folder,
			// A folder is a note, so it takes the note write projection rather than shipping a
			// (necessarily empty) ProseMirror document with it.
			(input) => operations.projects.create_folder(input)
		),
		move_project_entry: defineTool(
			constructReadTool,
			'move_project_entry',
			'mutation',
			agentToolInputSchemas.move_project_entry,
			(input) => operations.projects.move_project_entry(input)
		)
	});
	const notes = () => ({
		get_note: defineTool(
			constructReadTool,
			'get_note',
			'read',
			agentToolInputSchemas.get_note,
			(input) => operations.notes.get_note(input)
		),
		create_note: defineTool(
			constructReadTool,
			'create_note',
			'mutation',
			// Optional here and required in `CreateNoteInput` on purpose. The service
			// will not invent a project, and a bare schema rejection would tell the
			// model only that a field is missing — which is what left it guessing in
			// the first place. Accepting the absence lets the failure carry the
			// projects it can choose from, which is an adapter's job.
			agentToolInputSchemas.create_note,
			(input) => operations.notes.create_note(input)
		),
		save_note: defineTool(
			constructReadTool,
			'save_note',
			'mutation',
			agentToolInputSchemas.save_note,
			(input) => operations.notes.save_note(input)
		),
		edit_note: defineTool(
			constructReadTool,
			'edit_note',
			'mutation',
			agentToolInputSchemas.edit_note,
			(input) => operations.notes.edit_note(input)
		),
		rename_note: defineTool(
			constructReadTool,
			'rename_note',
			'mutation',
			agentToolInputSchemas.rename_note,
			(input) => operations.notes.rename_note(input)
		),
		archive_note: defineTool(
			constructReadTool,
			'archive_note',
			'mutation',
			agentToolInputSchemas.archive_note,
			(input) => operations.notes.archive_note(input)
		),
		restore_note: defineTool(
			constructReadTool,
			'restore_note',
			'mutation',
			agentToolInputSchemas.restore_note,
			(input) => operations.notes.restore_note(input)
		),
		list_trashed_notes: defineTool(
			constructReadTool,
			'list_trashed_notes',
			'read',
			agentToolInputSchemas.list_trashed_notes,
			(input) => operations.notes.list_trashed_notes(input)
		),
		delete_note_forever: defineTool(
			constructReadTool,
			'delete_note_forever',
			'mutation',
			agentToolInputSchemas.delete_note_forever,
			(input) => operations.notes.delete_note_forever(input)
		),
		empty_note_trash: defineTool(
			constructReadTool,
			'empty_note_trash',
			'mutation',
			agentToolInputSchemas.empty_note_trash,
			(input) => operations.notes.empty_note_trash(input)
		),
		list_note_versions: defineTool(
			constructReadTool,
			'list_note_versions',
			'read',
			agentToolInputSchemas.list_note_versions,
			(input) => operations.notes.list_note_versions(input)
		),
		diff_note_versions: defineTool(
			constructReadTool,
			'diff_note_versions',
			'read',
			agentToolInputSchemas.diff_note_versions,
			(input) => operations.notes.diff_note_versions(input)
		),
		restore_note_version: defineTool(
			constructReadTool,
			'restore_note_version',
			'mutation',
			agentToolInputSchemas.restore_note_version,
			(input) => operations.notes.restore_note_version(input)
		),
		publish_note: defineTool(
			constructReadTool,
			'publish_note',
			'mutation',
			agentToolInputSchemas.publish_note,
			(input) => operations.notes.publish_note(input)
		),
		discard_note_draft: defineTool(
			constructReadTool,
			'discard_note_draft',
			'mutation',
			agentToolInputSchemas.discard_note_draft,
			(input) => operations.notes.discard_note_draft(input)
		)
	});
	const todos = () => ({
		list_todos: defineTool(
			constructReadTool,
			'list_todos',
			'read',
			agentToolInputSchemas.list_todos,
			(input) => operations.todos.list_todos(input)
		),
		create_todo: defineTool(
			constructReadTool,
			'create_todo',
			'mutation',
			agentToolInputSchemas.create_todo,
			(input) => operations.todos.create_todo(input)
		),
		create_todos: defineTool(
			constructReadTool,
			'create_todos',
			'mutation',
			agentToolInputSchemas.create_todos,
			(input) => operations.todos.create_todos(input)
		),
		update_todo: defineTool(
			constructReadTool,
			'update_todo',
			'mutation',
			agentToolInputSchemas.update_todo,
			// The controller also returns the whole `TodoView`, which the model never reads.
			(input) => operations.todos.update_todo(input)
		)
	});
	const diagrams = () => ({
		revise_mermaid_diagram: defineTool(
			constructReadTool,
			'revise_mermaid_diagram',
			'mutation',
			agentToolInputSchemas.revise_mermaid_diagram,
			(input) => operations.diagrams.revise_mermaid_diagram(input)
		),
		search_icons: defineTool(
			constructReadTool,
			'search_icons',
			'read',
			agentToolInputSchemas.search_icons,
			(input) => operations.diagrams.search_icons(input)
		),
		read_project_diagram: defineTool(
			constructReadTool,
			'read_project_diagram',
			'read',
			agentToolInputSchemas.read_project_diagram,
			(input) => operations.diagrams.read_project_diagram(input)
		),
		promote_diagram: defineTool(
			constructReadTool,
			'promote_diagram',
			'proposal',
			agentToolInputSchemas.promote_diagram,
			(input) => operations.diagrams.promote_diagram(input)
		)
	});
	const suggestions = () => ({
		list_suggestions: defineTool(
			constructReadTool,
			'list_suggestions',
			'read',
			agentToolInputSchemas.list_suggestions,
			(input) => operations.suggestions.list_suggestions(input)
		),
		accept_suggestion: defineTool(
			constructReadTool,
			'accept_suggestion',
			'mutation',
			agentToolInputSchemas.accept_suggestion,
			// `acceptReviewed`, not `accept`: a draw.io diagram accepted without its
			// review has no preview and can never gain one, and that guard lives in
			// `acceptReviewed`. Bound to the raw `accept`, this tool was the one
			// caller in the system that could mint a preview-less diagram. For every
			// other kind of suggestion the two are the same call.
			(input) => operations.suggestions.accept_suggestion(input)
		),
		reject_suggestion: defineTool(
			constructReadTool,
			'reject_suggestion',
			'mutation',
			agentToolInputSchemas.reject_suggestion,
			(input) => operations.suggestions.reject_suggestion(input)
		),
		revert_suggestion: defineTool(
			constructReadTool,
			'revert_suggestion',
			'mutation',
			agentToolInputSchemas.revert_suggestion,
			(input) => operations.suggestions.revert_suggestion(input)
		)
	});
	const skills = () => ({
		list_skills: defineTool(
			constructReadTool,
			'list_skills',
			'read',
			agentToolInputSchemas.list_skills,
			() => operations.skills.list_skills()
		),
		save_skill: defineTool(
			constructReadTool,
			'save_skill',
			'mutation',
			agentToolInputSchemas.save_skill,
			(input) => operations.skills.save_skill(input)
		),
		edit_skill: defineTool(
			constructReadTool,
			'edit_skill',
			'mutation',
			agentToolInputSchemas.edit_skill,
			(input) => operations.skills.edit_skill(input)
		),
		create_skill: defineTool(
			constructReadTool,
			'create_skill',
			'mutation',
			agentToolInputSchemas.create_skill,
			(input) => operations.skills.create_skill(input)
		),
		list_skill_versions: defineTool(
			constructReadTool,
			'list_skill_versions',
			'read',
			agentToolInputSchemas.list_skill_versions,
			(input) => operations.skills.list_skill_versions(input)
		),
		restore_skill_version: defineTool(
			constructReadTool,
			'restore_skill_version',
			'mutation',
			agentToolInputSchemas.restore_skill_version,
			(input) => operations.skills.restore_skill_version(input)
		),
		update_skill: defineTool(
			constructReadTool,
			'update_skill',
			'mutation',
			agentToolInputSchemas.update_skill,
			(input) => operations.skills.update_skill(input)
		),
		set_skill_pinned: defineTool(
			constructReadTool,
			'set_skill_pinned',
			'mutation',
			agentToolInputSchemas.set_skill_pinned,
			(input) => operations.skills.set_skill_pinned(input)
		)
	});
	const account = () => ({
		list_api_tokens: defineTool(
			constructReadTool,
			'list_api_tokens',
			'read',
			agentToolInputSchemas.list_api_tokens,
			() => operations.account.list_api_tokens()
		),
		revoke_api_token: defineTool(
			constructReadTool,
			'revoke_api_token',
			'mutation',
			agentToolInputSchemas.revoke_api_token,
			(input) => operations.account.revoke_api_token(input)
		),
		list_attachments: defineTool(
			constructReadTool,
			'list_attachments',
			'read',
			agentToolInputSchemas.list_attachments,
			(input) => operations.account.list_attachments(input)
		)
	});
	const memoryAndPreferences = () => ({
		list_project_memory: defineTool(
			constructReadTool,
			'list_project_memory',
			'read',
			agentToolInputSchemas.list_project_memory,
			(input) => operations.memoryAndPreferences.list_project_memory(input)
		),
		list_user_memory: defineTool(
			constructReadTool,
			'list_user_memory',
			'read',
			agentToolInputSchemas.list_user_memory,
			() => operations.memoryAndPreferences.list_user_memory()
		),
		propose_memory_change: defineTool(
			constructReadTool,
			'propose_memory_change',
			'proposal',
			agentToolInputSchemas.propose_memory_change,
			(input) => operations.memoryAndPreferences.propose_memory_change(readMemoryProposal(input))
		),
		list_trust_policies: defineTool(
			constructReadTool,
			'list_trust_policies',
			'read',
			agentToolInputSchemas.list_trust_policies,
			() => operations.memoryAndPreferences.list_trust_policies()
		),
		update_trust_policy: defineTool(
			constructReadTool,
			'update_trust_policy',
			'mutation',
			agentToolInputSchemas.update_trust_policy,
			(input) => operations.memoryAndPreferences.update_trust_policy(input)
		),
		list_tool_preferences: defineTool(
			constructReadTool,
			'list_tool_preferences',
			'read',
			agentToolInputSchemas.list_tool_preferences,
			(input) => operations.memoryAndPreferences.list_tool_preferences(input)
		),
		set_tool_enabled: defineTool(
			constructReadTool,
			'set_tool_enabled',
			'mutation',
			agentToolInputSchemas.set_tool_enabled,
			(input) => operations.memoryAndPreferences.set_tool_enabled(input)
		),
		get_agent_preferences: defineTool(
			constructReadTool,
			'get_agent_preferences',
			'read',
			agentToolInputSchemas.get_agent_preferences,
			() => operations.memoryAndPreferences.get_agent_preferences()
		),
		update_agent_preferences: defineTool(
			constructReadTool,
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
			(input) => operations.memoryAndPreferences.update_agent_preferences(input)
		),
		list_agent_models: defineTool(
			constructReadTool,
			'list_agent_models',
			'read',
			agentToolInputSchemas.list_agent_models,
			() => operations.memoryAndPreferences.list_agent_models()
		)
	});
	const deliverables = () => ({
		export_document: defineTool(
			constructReadTool,
			'export_document',
			'mutation',
			agentToolInputSchemas.export_document,
			(input) => operations.deliverables.export_document(input)
		),
		list_artifacts: defineTool(
			constructReadTool,
			'list_artifacts',
			'read',
			agentToolInputSchemas.list_artifacts,
			(input) => operations.deliverables.list_artifacts(input)
		),
		list_templates: defineTool(
			constructReadTool,
			'list_templates',
			'read',
			agentToolInputSchemas.list_templates,
			(input) => operations.deliverables.list_templates(input)
		),
		get_export_settings: defineTool(
			constructReadTool,
			'get_export_settings',
			'read',
			agentToolInputSchemas.get_export_settings,
			(input) => operations.deliverables.get_export_settings(input)
		),
		update_export_settings: defineTool(
			constructReadTool,
			'update_export_settings',
			'mutation',
			agentToolInputSchemas.update_export_settings,
			(input) => operations.deliverables.update_export_settings(input)
		),
		get_artifact: defineTool(
			constructReadTool,
			'get_artifact',
			'read',
			agentToolInputSchemas.get_artifact,
			(input) => operations.deliverables.get_artifact(input)
		),
		download_artifact: defineTool(
			constructReadTool,
			'download_artifact',
			'read',
			agentToolInputSchemas.download_artifact,
			(input) => operations.deliverables.download_artifact(input)
		),
		delete_artifact: defineTool(
			constructReadTool,
			'delete_artifact',
			'mutation',
			agentToolInputSchemas.delete_artifact,
			(input) => operations.deliverables.delete_artifact(input)
		),
		regenerate_artifact: defineTool(
			constructReadTool,
			'regenerate_artifact',
			'mutation',
			agentToolInputSchemas.regenerate_artifact,
			(input) => operations.deliverables.regenerate_artifact(input)
		)
	});
	const widgets = () => ({
		read_widget_catalog: defineTool(
			constructReadTool,
			'read_widget_catalog',
			'read',
			agentToolInputSchemas.read_widget_catalog,
			() => operations.widgets.read_widget_catalog()
		),
		create_widget: defineTool(
			constructReadTool,
			'create_widget',
			'mutation',
			agentToolInputSchemas.create_widget,
			(input) => operations.widgets.create_widget(readWidgetCreation(input))
		),
		list_widgets: defineTool(
			constructReadTool,
			'list_widgets',
			'read',
			agentToolInputSchemas.list_widgets,
			(input) => operations.widgets.list_widgets(input)
		),
		read_widget: defineTool(
			constructReadTool,
			'read_widget',
			'read',
			agentToolInputSchemas.read_widget,
			(input) => operations.widgets.read_widget(input)
		),
		edit_widget_data: defineTool(
			constructReadTool,
			'edit_widget_data',
			'mutation',
			agentToolInputSchemas.edit_widget_data,
			(input) => operations.widgets.edit_widget_data(readWidgetDataEdit(input))
		),
		edit_widget_layout: defineTool(
			constructReadTool,
			'edit_widget_layout',
			'mutation',
			agentToolInputSchemas.edit_widget_layout,
			(input) => operations.widgets.edit_widget_layout(readWidgetLayoutEdit(input))
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
	constructReadTool: ReadToolConstruction,
	operations: SelectionToolOperationsSet
) => ({
	extract_promises: defineTool(
		constructReadTool,
		'extract_promises',
		'proposal',
		agentToolInputSchemas.extract_promises,
		(input) => operations.selection.extract_promises(input)
	),
	relate_selection: defineTool(
		constructReadTool,
		'relate_selection',
		'proposal',
		agentToolInputSchemas.relate_selection,
		() => operations.selection.relate_selection()
	),
	find_references: defineTool(
		constructReadTool,
		'find_references',
		'proposal',
		agentToolInputSchemas.find_references,
		() => operations.selection.find_references()
	),
	create_skill_from_selection: defineTool(
		constructReadTool,
		'create_skill_from_selection',
		'mutation',
		agentToolInputSchemas.create_skill_from_selection,
		(input) => operations.selection.create_skill_from_selection(input)
	)
});
const appToolDefinitions = (
	constructReadTool: ReadToolConstruction,
	operations: AppToolOperationsSet
) => {
	return {
		load_skill: defineTool(
			constructReadTool,
			'load_skill',
			'read',
			agentToolInputSchemas.load_skill,
			(input) => operations.app.load_skill(input)
		),
		create_diagram: defineTool(
			constructReadTool,
			'create_diagram',
			'mutation',
			// `projectId` is optional here and required on `CreateDiagramInput`, for the
			// reason `create_note` is: a bare schema rejection would tell the model only
			// that a field is missing, and `requireProject` names the projects instead.
			agentToolInputSchemas.create_diagram,
			(input) => operations.app.create_diagram(input)
		),
		edit_diagram: defineTool(
			constructReadTool,
			'edit_diagram',
			'mutation',
			agentToolInputSchemas.edit_diagram,
			(input) => operations.app.edit_diagram(input)
		),
		read_canvas_diagram: defineTool(
			constructReadTool,
			'read_canvas_diagram',
			'read',
			agentToolInputSchemas.read_canvas_diagram,
			() => operations.app.read_canvas_diagram()
		)
	};
};
const mcpOnlyDefinitions = (
	constructReadTool: ReadToolConstruction,
	operations: McpToolOperationsSet
) => ({
	load_skill: defineTool(
		constructReadTool,
		'load_skill',
		'read',
		agentToolInputSchemas.load_skill,
		(input) => operations.mcp.load_skill(input)
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

/** Bind protocol schemas to complete operations without executing them. */
export class SharedToolDefinitions {
	constructor(
		private readonly constructReadTool: ReadToolConstruction,
		private readonly operations: () => SharedToolOperations
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(sharedToolDefinitions(this.constructReadTool, this.operations()));
	}
}
export class AppToolDefinitions {
	constructor(
		private readonly constructReadTool: ReadToolConstruction,
		private readonly operations: () => AppToolOperationsSet
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(appToolDefinitions(this.constructReadTool, this.operations()));
	}
}
export class SelectionToolDefinitions {
	constructor(
		private readonly constructReadTool: ReadToolConstruction,
		private readonly operations: SelectionToolOperationsSet
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(selectionToolDefinitions(this.constructReadTool, this.operations));
	}
}
export class McpToolDefinitions {
	constructor(
		private readonly constructReadTool: ReadToolConstruction,
		private readonly operations: () => McpToolOperationsSet
	) {}
	definitions(): AgentToolDefinition[] {
		return Object.values(mcpOnlyDefinitions(this.constructReadTool, this.operations()));
	}
}
