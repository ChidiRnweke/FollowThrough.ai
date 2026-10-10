import type { ToolClassification } from '$lib/models/agent';
import { agentToolInputSchemas } from '$lib/models/agent-tool-inputs';
import { agentPayloadResultSchema } from '$lib/models/agent/payload';
import { type ToolName } from '$lib/models/agent/tool-catalog';
import { bindToolArguments } from '$lib/server/adapters/agent/tool-call';
import type { PreparedAction } from '$lib/server/controllers/agent/tool-calls';
import type {
	AppToolOperationsSet,
	McpToolOperationsSet,
	SelectionToolOperationsSet,
	SharedToolOperations
} from '$lib/server/controllers/agent/tool-operations/contracts';
import type { AgentToolOutput } from '$lib/server/controllers/agent/tool-outputs';
import type { AgentToolResultControl } from '$lib/server/controllers/agent/tool-results';
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
type Definition = AgentToolDefinition;
const defineTool = <Name extends ToolName, Shape extends z.ZodRawShape>(
	rules: AgentToolResultControl,
	name: Name,
	description: string,
	classification: Definition['classification'],
	parameters: z.ZodObject<Shape>,
	execute: (input: z.infer<z.ZodObject<Shape>>) => Promise<AgentToolOutput<Name>>
): Definition => {
	const strictParameters = parameters.strict();
	return {
		name,
		description,
		classification,
		parameters: strictParameters,
		prepare: (input) =>
			bindToolArguments(parameters, input, async (parsed, payload) => {
				const result = await execute(parsed);
				const read = agentPayloadResultSchema.parse(result);
				if (read.kind === 'corrupt')
					throw new Error(`Tool output could not be represented as JSON: ${read.message}`);
				return rules.select(read.value, payload);
			})
	};
};

export const sharedToolDefinitions = (
	rules: AgentToolResultControl,
	operations: SharedToolOperations
) => {
	const retrieval = () => ({
		ls: defineTool(
			rules,
			'ls',
			rules.description('ls'),
			'read',
			agentToolInputSchemas.ls,
			async (input) => projectFileResult(await operations.retrieval.ls(input))
		),
		grep: defineTool(
			rules,
			'grep',
			rules.description('grep'),
			'read',
			agentToolInputSchemas.grep,
			async (input) => projectFileResult(await operations.retrieval.grep(input))
		),
		sed: defineTool(
			rules,
			'sed',
			rules.description('sed'),
			'read',
			agentToolInputSchemas.sed,
			async (input) => projectFileResult(await operations.retrieval.sed(input))
		),
		search: defineTool(
			rules,
			'search',
			rules.description('search'),
			'read',
			agentToolInputSchemas.search,
			(input) => operations.retrieval.search(input)
		),
		search_note: defineTool(
			rules,
			'search_note',
			rules.description('search_note'),
			'read',
			agentToolInputSchemas.search_note,
			(input) => operations.retrieval.search_note(input)
		),
		get_workspace_context: defineTool(
			rules,
			'get_workspace_context',
			rules.description('get_workspace_context'),
			'read',
			agentToolInputSchemas.get_workspace_context,
			() => operations.retrieval.get_workspace_context()
		),
		get_today_view: defineTool(
			rules,
			'get_today_view',
			rules.description('get_today_view'),
			'read',
			agentToolInputSchemas.get_today_view,
			(input) => operations.retrieval.get_today_view(input)
		)
	});
	const projects = () => ({
		list_projects: defineTool(
			rules,
			'list_projects',
			rules.description('list_projects'),
			'read',
			agentToolInputSchemas.list_projects,
			() => operations.projects.list_projects()
		),
		get_project: defineTool(
			rules,
			'get_project',
			rules.description('get_project'),
			'read',
			agentToolInputSchemas.get_project,
			(input) => operations.projects.get_project(input)
		),
		create_project: defineTool(
			rules,
			'create_project',
			rules.description('create_project'),
			'mutation',
			agentToolInputSchemas.create_project,
			(input) => operations.projects.create_project(input)
		),
		rename_project: defineTool(
			rules,
			'rename_project',
			rules.description('rename_project'),
			'mutation',
			agentToolInputSchemas.rename_project,
			(input) => operations.projects.rename_project(input)
		),
		archive_project: defineTool(
			rules,
			'archive_project',
			rules.description('archive_project'),
			'mutation',
			agentToolInputSchemas.archive_project,
			(input) => operations.projects.archive_project(input)
		),
		create_folder: defineTool(
			rules,
			'create_folder',
			rules.description('create_folder'),
			'mutation',
			agentToolInputSchemas.create_folder,
			// A folder is a note, so it takes the note write projection rather than shipping a
			// (necessarily empty) ProseMirror document with it.
			(input) => operations.projects.create_folder(input)
		),
		move_project_entry: defineTool(
			rules,
			'move_project_entry',
			rules.description('move_project_entry'),
			'mutation',
			agentToolInputSchemas.move_project_entry,
			(input) => operations.projects.move_project_entry(input)
		)
	});
	const notes = () => ({
		get_note: defineTool(
			rules,
			'get_note',
			rules.description('get_note'),
			'read',
			agentToolInputSchemas.get_note,
			(input) => operations.notes.get_note(input)
		),
		create_note: defineTool(
			rules,
			'create_note',
			rules.description('create_note'),
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
			rules,
			'save_note',
			rules.description('save_note'),
			'mutation',
			agentToolInputSchemas.save_note,
			(input) => operations.notes.save_note(input)
		),
		edit_note: defineTool(
			rules,
			'edit_note',
			rules.description('edit_note'),
			'mutation',
			agentToolInputSchemas.edit_note,
			(input) => operations.notes.edit_note(input)
		),
		rename_note: defineTool(
			rules,
			'rename_note',
			rules.description('rename_note'),
			'mutation',
			agentToolInputSchemas.rename_note,
			(input) => operations.notes.rename_note(input)
		),
		archive_note: defineTool(
			rules,
			'archive_note',
			rules.description('archive_note'),
			'mutation',
			agentToolInputSchemas.archive_note,
			(input) => operations.notes.archive_note(input)
		),
		restore_note: defineTool(
			rules,
			'restore_note',
			rules.description('restore_note'),
			'mutation',
			agentToolInputSchemas.restore_note,
			(input) => operations.notes.restore_note(input)
		),
		list_trashed_notes: defineTool(
			rules,
			'list_trashed_notes',
			rules.description('list_trashed_notes'),
			'read',
			agentToolInputSchemas.list_trashed_notes,
			(input) => operations.notes.list_trashed_notes(input)
		),
		delete_note_forever: defineTool(
			rules,
			'delete_note_forever',
			rules.description('delete_note_forever'),
			'mutation',
			agentToolInputSchemas.delete_note_forever,
			(input) => operations.notes.delete_note_forever(input)
		),
		empty_note_trash: defineTool(
			rules,
			'empty_note_trash',
			rules.description('empty_note_trash'),
			'mutation',
			agentToolInputSchemas.empty_note_trash,
			(input) => operations.notes.empty_note_trash(input)
		),
		list_note_versions: defineTool(
			rules,
			'list_note_versions',
			rules.description('list_note_versions'),
			'read',
			agentToolInputSchemas.list_note_versions,
			(input) => operations.notes.list_note_versions(input)
		),
		diff_note_versions: defineTool(
			rules,
			'diff_note_versions',
			rules.description('diff_note_versions'),
			'read',
			agentToolInputSchemas.diff_note_versions,
			(input) => operations.notes.diff_note_versions(input)
		),
		restore_note_version: defineTool(
			rules,
			'restore_note_version',
			rules.description('restore_note_version'),
			'mutation',
			agentToolInputSchemas.restore_note_version,
			(input) => operations.notes.restore_note_version(input)
		),
		publish_note: defineTool(
			rules,
			'publish_note',
			rules.description('publish_note'),
			'mutation',
			agentToolInputSchemas.publish_note,
			(input) => operations.notes.publish_note(input)
		),
		discard_note_draft: defineTool(
			rules,
			'discard_note_draft',
			rules.description('discard_note_draft'),
			'mutation',
			agentToolInputSchemas.discard_note_draft,
			(input) => operations.notes.discard_note_draft(input)
		)
	});
	const todos = () => ({
		list_todos: defineTool(
			rules,
			'list_todos',
			rules.description('list_todos'),
			'read',
			agentToolInputSchemas.list_todos,
			(input) => operations.todos.list_todos(input)
		),
		create_todo: defineTool(
			rules,
			'create_todo',
			rules.description('create_todo'),
			'mutation',
			agentToolInputSchemas.create_todo,
			(input) => operations.todos.create_todo(input)
		),
		create_todos: defineTool(
			rules,
			'create_todos',
			rules.description('create_todos'),
			'mutation',
			agentToolInputSchemas.create_todos,
			(input) => operations.todos.create_todos(input)
		),
		update_todo: defineTool(
			rules,
			'update_todo',
			rules.description('update_todo'),
			'mutation',
			agentToolInputSchemas.update_todo,
			// The controller also returns the whole `TodoView`, which the model never reads.
			(input) => operations.todos.update_todo(input)
		)
	});
	const diagrams = () => ({
		revise_mermaid_diagram: defineTool(
			rules,
			'revise_mermaid_diagram',
			rules.description('revise_mermaid_diagram'),
			'mutation',
			agentToolInputSchemas.revise_mermaid_diagram,
			(input) => operations.diagrams.revise_mermaid_diagram(input)
		),
		search_icons: defineTool(
			rules,
			'search_icons',
			rules.description('search_icons'),
			'read',
			agentToolInputSchemas.search_icons,
			(input) => operations.diagrams.search_icons(input)
		),
		read_project_diagram: defineTool(
			rules,
			'read_project_diagram',
			rules.description('read_project_diagram'),
			'read',
			agentToolInputSchemas.read_project_diagram,
			(input) => operations.diagrams.read_project_diagram(input)
		),
		promote_diagram: defineTool(
			rules,
			'promote_diagram',
			rules.description('promote_diagram'),
			'proposal',
			agentToolInputSchemas.promote_diagram,
			(input) => operations.diagrams.promote_diagram(input)
		)
	});
	const suggestions = () => ({
		list_suggestions: defineTool(
			rules,
			'list_suggestions',
			rules.description('list_suggestions'),
			'read',
			agentToolInputSchemas.list_suggestions,
			(input) => operations.suggestions.list_suggestions(input)
		),
		accept_suggestion: defineTool(
			rules,
			'accept_suggestion',
			rules.description('accept_suggestion'),
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
			rules,
			'reject_suggestion',
			rules.description('reject_suggestion'),
			'mutation',
			agentToolInputSchemas.reject_suggestion,
			(input) => operations.suggestions.reject_suggestion(input)
		),
		revert_suggestion: defineTool(
			rules,
			'revert_suggestion',
			rules.description('revert_suggestion'),
			'mutation',
			agentToolInputSchemas.revert_suggestion,
			(input) => operations.suggestions.revert_suggestion(input)
		)
	});
	const skills = () => ({
		list_skills: defineTool(
			rules,
			'list_skills',
			rules.description('list_skills'),
			'read',
			agentToolInputSchemas.list_skills,
			() => operations.skills.list_skills()
		),
		save_skill: defineTool(
			rules,
			'save_skill',
			rules.description('save_skill'),
			'mutation',
			agentToolInputSchemas.save_skill,
			(input) => operations.skills.save_skill(input)
		),
		edit_skill: defineTool(
			rules,
			'edit_skill',
			rules.description('edit_skill'),
			'mutation',
			agentToolInputSchemas.edit_skill,
			(input) => operations.skills.edit_skill(input)
		),
		create_skill: defineTool(
			rules,
			'create_skill',
			rules.description('create_skill'),
			'mutation',
			agentToolInputSchemas.create_skill,
			(input) => operations.skills.create_skill(input)
		),
		list_skill_versions: defineTool(
			rules,
			'list_skill_versions',
			rules.description('list_skill_versions'),
			'read',
			agentToolInputSchemas.list_skill_versions,
			(input) => operations.skills.list_skill_versions(input)
		),
		restore_skill_version: defineTool(
			rules,
			'restore_skill_version',
			rules.description('restore_skill_version'),
			'mutation',
			agentToolInputSchemas.restore_skill_version,
			(input) => operations.skills.restore_skill_version(input)
		),
		update_skill: defineTool(
			rules,
			'update_skill',
			rules.description('update_skill'),
			'mutation',
			agentToolInputSchemas.update_skill,
			(input) => operations.skills.update_skill(input)
		),
		set_skill_pinned: defineTool(
			rules,
			'set_skill_pinned',
			rules.description('set_skill_pinned'),
			'mutation',
			agentToolInputSchemas.set_skill_pinned,
			(input) => operations.skills.set_skill_pinned(input)
		)
	});
	const account = () => ({
		list_api_tokens: defineTool(
			rules,
			'list_api_tokens',
			rules.description('list_api_tokens'),
			'read',
			agentToolInputSchemas.list_api_tokens,
			() => operations.account.list_api_tokens()
		),
		revoke_api_token: defineTool(
			rules,
			'revoke_api_token',
			rules.description('revoke_api_token'),
			'mutation',
			agentToolInputSchemas.revoke_api_token,
			(input) => operations.account.revoke_api_token(input)
		),
		list_attachments: defineTool(
			rules,
			'list_attachments',
			rules.description('list_attachments'),
			'read',
			agentToolInputSchemas.list_attachments,
			(input) => operations.account.list_attachments(input)
		)
	});
	const memoryAndPreferences = () => ({
		list_project_memory: defineTool(
			rules,
			'list_project_memory',
			rules.description('list_project_memory'),
			'read',
			agentToolInputSchemas.list_project_memory,
			(input) => operations.memoryAndPreferences.list_project_memory(input)
		),
		list_user_memory: defineTool(
			rules,
			'list_user_memory',
			rules.description('list_user_memory'),
			'read',
			agentToolInputSchemas.list_user_memory,
			() => operations.memoryAndPreferences.list_user_memory()
		),
		propose_memory_change: defineTool(
			rules,
			'propose_memory_change',
			rules.description('propose_memory_change'),
			'proposal',
			agentToolInputSchemas.propose_memory_change,
			(input) => operations.memoryAndPreferences.propose_memory_change(readMemoryProposal(input))
		),
		list_trust_policies: defineTool(
			rules,
			'list_trust_policies',
			rules.description('list_trust_policies'),
			'read',
			agentToolInputSchemas.list_trust_policies,
			() => operations.memoryAndPreferences.list_trust_policies()
		),
		update_trust_policy: defineTool(
			rules,
			'update_trust_policy',
			rules.description('update_trust_policy'),
			'mutation',
			agentToolInputSchemas.update_trust_policy,
			(input) => operations.memoryAndPreferences.update_trust_policy(input)
		),
		list_tool_preferences: defineTool(
			rules,
			'list_tool_preferences',
			rules.description('list_tool_preferences'),
			'read',
			agentToolInputSchemas.list_tool_preferences,
			(input) => operations.memoryAndPreferences.list_tool_preferences(input)
		),
		set_tool_enabled: defineTool(
			rules,
			'set_tool_enabled',
			rules.description('set_tool_enabled'),
			'mutation',
			agentToolInputSchemas.set_tool_enabled,
			(input) => operations.memoryAndPreferences.set_tool_enabled(input)
		),
		get_agent_preferences: defineTool(
			rules,
			'get_agent_preferences',
			rules.description('get_agent_preferences'),
			'read',
			agentToolInputSchemas.get_agent_preferences,
			() => operations.memoryAndPreferences.get_agent_preferences()
		),
		update_agent_preferences: defineTool(
			rules,
			'update_agent_preferences',
			rules.description('update_agent_preferences'),
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
			rules,
			'list_agent_models',
			rules.description('list_agent_models'),
			'read',
			agentToolInputSchemas.list_agent_models,
			() => operations.memoryAndPreferences.list_agent_models()
		)
	});
	const deliverables = () => ({
		export_document: defineTool(
			rules,
			'export_document',
			rules.description('export_document'),
			'mutation',
			agentToolInputSchemas.export_document,
			(input) => operations.deliverables.export_document(input)
		),
		list_artifacts: defineTool(
			rules,
			'list_artifacts',
			rules.description('list_artifacts'),
			'read',
			agentToolInputSchemas.list_artifacts,
			(input) => operations.deliverables.list_artifacts(input)
		),
		list_templates: defineTool(
			rules,
			'list_templates',
			rules.description('list_templates'),
			'read',
			agentToolInputSchemas.list_templates,
			(input) => operations.deliverables.list_templates(input)
		),
		get_export_settings: defineTool(
			rules,
			'get_export_settings',
			rules.description('get_export_settings'),
			'read',
			agentToolInputSchemas.get_export_settings,
			(input) => operations.deliverables.get_export_settings(input)
		),
		update_export_settings: defineTool(
			rules,
			'update_export_settings',
			rules.description('update_export_settings'),
			'mutation',
			agentToolInputSchemas.update_export_settings,
			(input) => operations.deliverables.update_export_settings(input)
		),
		get_artifact: defineTool(
			rules,
			'get_artifact',
			rules.description('get_artifact'),
			'read',
			agentToolInputSchemas.get_artifact,
			(input) => operations.deliverables.get_artifact(input)
		),
		download_artifact: defineTool(
			rules,
			'download_artifact',
			rules.description('download_artifact'),
			'read',
			agentToolInputSchemas.download_artifact,
			(input) => operations.deliverables.download_artifact(input)
		),
		delete_artifact: defineTool(
			rules,
			'delete_artifact',
			rules.description('delete_artifact'),
			'mutation',
			agentToolInputSchemas.delete_artifact,
			(input) => operations.deliverables.delete_artifact(input)
		),
		regenerate_artifact: defineTool(
			rules,
			'regenerate_artifact',
			rules.description('regenerate_artifact'),
			'mutation',
			agentToolInputSchemas.regenerate_artifact,
			(input) => operations.deliverables.regenerate_artifact(input)
		)
	});
	const widgets = () => ({
		read_widget_catalog: defineTool(
			rules,
			'read_widget_catalog',
			rules.description('read_widget_catalog'),
			'read',
			agentToolInputSchemas.read_widget_catalog,
			() => operations.widgets.read_widget_catalog()
		),
		create_widget: defineTool(
			rules,
			'create_widget',
			rules.description('create_widget'),
			'mutation',
			agentToolInputSchemas.create_widget,
			(input) => operations.widgets.create_widget(readWidgetCreation(input))
		),
		list_widgets: defineTool(
			rules,
			'list_widgets',
			rules.description('list_widgets'),
			'read',
			agentToolInputSchemas.list_widgets,
			(input) => operations.widgets.list_widgets(input)
		),
		read_widget: defineTool(
			rules,
			'read_widget',
			rules.description('read_widget'),
			'read',
			agentToolInputSchemas.read_widget,
			(input) => operations.widgets.read_widget(input)
		),
		edit_widget_data: defineTool(
			rules,
			'edit_widget_data',
			rules.description('edit_widget_data'),
			'mutation',
			agentToolInputSchemas.edit_widget_data,
			(input) => operations.widgets.edit_widget_data(readWidgetDataEdit(input))
		),
		edit_widget_layout: defineTool(
			rules,
			'edit_widget_layout',
			rules.description('edit_widget_layout'),
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
export const selectionToolDefinitions = (
	rules: AgentToolResultControl,
	operations: SelectionToolOperationsSet
) => ({
	extract_promises: defineTool(
		rules,
		'extract_promises',
		rules.description('extract_promises'),
		'proposal',
		agentToolInputSchemas.extract_promises,
		(input) => operations.selection.extract_promises(input)
	),
	relate_selection: defineTool(
		rules,
		'relate_selection',
		rules.description('relate_selection'),
		'proposal',
		agentToolInputSchemas.relate_selection,
		() => operations.selection.relate_selection()
	),
	find_references: defineTool(
		rules,
		'find_references',
		rules.description('find_references'),
		'proposal',
		agentToolInputSchemas.find_references,
		() => operations.selection.find_references()
	),
	create_skill_from_selection: defineTool(
		rules,
		'create_skill_from_selection',
		rules.description('create_skill_from_selection'),
		'mutation',
		agentToolInputSchemas.create_skill_from_selection,
		(input) => operations.selection.create_skill_from_selection(input)
	)
});
export const appToolDefinitions = (
	rules: AgentToolResultControl,
	operations: AppToolOperationsSet
) => {
	return {
		load_skill: defineTool(
			rules,
			'load_skill',
			rules.description('load_skill'),
			'read',
			agentToolInputSchemas.load_skill,
			(input) => operations.app.load_skill(input)
		),
		create_diagram: defineTool(
			rules,
			'create_diagram',
			rules.description('create_diagram'),
			'mutation',
			// `projectId` is optional here and required on `CreateDiagramInput`, for the
			// reason `create_note` is: a bare schema rejection would tell the model only
			// that a field is missing, and `requireProject` names the projects instead.
			agentToolInputSchemas.create_diagram,
			(input) => operations.app.create_diagram(input)
		),
		edit_diagram: defineTool(
			rules,
			'edit_diagram',
			rules.description('edit_diagram'),
			'mutation',
			agentToolInputSchemas.edit_diagram,
			(input) => operations.app.edit_diagram(input)
		),
		read_canvas_diagram: defineTool(
			rules,
			'read_canvas_diagram',
			rules.description('read_canvas_diagram'),
			'read',
			agentToolInputSchemas.read_canvas_diagram,
			() => operations.app.read_canvas_diagram()
		)
	};
};
export const mcpOnlyDefinitions = (
	rules: AgentToolResultControl,
	operations: McpToolOperationsSet
) => ({
	load_skill: defineTool(
		rules,
		'load_skill',
		rules.description('load_skill'),
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
