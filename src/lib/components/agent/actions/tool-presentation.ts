import type { ShellContext } from '$lib/models/workspace';
import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import {
	argumentLabel,
	isIdentifierArgument,
	noteTitle
} from '../../chat/actions/tool-approval-fields';
import { mechanismTools, quietTools, type RenderedTool } from './rendered-tools';
import { toolResultFields, type ToolResultFields } from './tool-result-fields';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';

/** Tools that write the note body, and so speak about the note rather than themselves. */
const noteBodyTools = new Set(['save_note', 'edit_note']);

/**
 * What a call is called, in the reader's language, before and after it settles.
 *
 * `Record<AgentToolName, string>` and not a lookup with a fallback, which is the
 * whole point. The fallback un-snake-cased the tool's own function name, and it
 * once covered 25 of the 44 rendered tools — so the shipped copy for every
 * diagram, skill, artifact, suggestion and memory action was a machine name:
 * "Edit diagram completed", "Propose memory change completed", "Revoke api
 * token completed". Nobody decided that; the map just had no entry and nothing
 * said so. The quiet and mechanism sets used to fall through to the same
 * fallback, which is how "Grep completed" and "Sed completed" reached the log —
 * but the log renders every call, so every name owes a label. A new tool now
 * fails to compile until someone writes what it is called; `quietTools` and
 * `mechanismTools` decide only whether a call earns a row in the turn summary,
 * never what it is named.
 */
const labels: Record<AgentToolName, string> = {
	get_project: 'Read project',
	create_project: 'Create project',
	rename_project: 'Rename project',
	archive_project: 'Archive project',
	create_folder: 'Create folder',
	move_project_entry: 'Move',
	get_note: 'Read note',
	create_note: 'Create note',
	save_note: 'Save note',
	edit_note: 'Edit note',
	rename_note: 'Rename note',
	archive_note: 'Move note to trash',
	restore_note: 'Restore note',
	delete_note_forever: 'Delete note permanently',
	empty_note_trash: 'Empty trash',
	list_note_versions: 'Read note history',
	restore_note_version: 'Restore note version',
	publish_note: 'Publish note',
	discard_note_draft: 'Discard note draft',
	create_todo: 'Create todo',
	create_todos: 'Create todos',
	update_todo: 'Update todo',
	extract_promises: 'Find commitments',
	relate_selection: 'Link selection',
	revise_mermaid_diagram: 'Revise diagram',
	promote_diagram: 'Keep diagram',
	accept_suggestion: 'Accept suggestion',
	reject_suggestion: 'Dismiss suggestion',
	revert_suggestion: 'Undo suggestion',
	save_skill: 'Save skill',
	edit_skill: 'Edit skill',
	create_skill: 'Create skill',
	create_skill_from_selection: 'Create skill from selection',
	restore_skill_version: 'Restore skill version',
	update_skill: 'Update skill',
	set_skill_pinned: 'Change skill pinning',
	propose_memory_change: 'Remember',
	export_document: 'Export document',
	create_diagram: 'Create diagram',
	edit_diagram: 'Edit diagram',
	update_export_settings: 'Update export settings',
	download_artifact: 'Prepare download',
	delete_artifact: 'Delete artifact',
	regenerate_artifact: 'Regenerate artifact',

	// Quiet in the turn summary, but the log still names every one of them.
	search: 'Search',
	search_note: 'Search within a note',
	ls: 'List files',
	grep: 'Search notes and files',
	sed: 'Read file excerpt',
	search_icons: 'Search icons',
	find_references: 'Find references',
	get_today_view: "Read today's work",
	get_artifact: 'Read artifact',
	get_export_settings: 'Read export settings',
	diff_note_versions: 'Compare note versions',
	read_canvas_diagram: 'Read canvas diagram',
	read_project_diagram: 'Read diagram',
	list_projects: 'List projects',
	list_todos: 'List todos',
	list_skills: 'List skills',
	list_skill_versions: 'List skill versions',
	list_artifacts: 'List artifacts',
	list_attachments: 'List attachments',
	list_templates: 'List templates',
	list_suggestions: 'List suggestions',
	list_trashed_notes: 'List trashed notes',
	list_user_memory: 'Read profile memory',
	list_project_memory: 'Read project memory',

	// Mechanism: the agent finding its footing, named all the same.
	search_tools: 'Look up available tools',
	get_workspace_context: 'Read workspace context',
	load_skill: 'Read skill',
	list_tool_preferences: 'Read tool availability',
	set_tool_enabled: 'Change tool availability',
	list_agent_models: 'List available models',
	get_agent_preferences: 'Read agent settings',
	update_agent_preferences: 'Change agent settings',
	list_trust_policies: 'Read trust policies',
	update_trust_policy: 'Change trust policy',
	list_api_tokens: 'List access tokens',
	revoke_api_token: 'Revoke access token'
};

const completedLabels: Record<AgentToolName, string> = {
	get_project: 'Read project',
	create_project: 'Created project',
	rename_project: 'Renamed project',
	archive_project: 'Archived project',
	create_folder: 'Created folder',
	move_project_entry: 'Moved',
	get_note: 'Read note',
	create_note: 'Created note',
	save_note: 'Saved note',
	edit_note: 'Edited note',
	rename_note: 'Renamed note',
	archive_note: 'Moved note to trash',
	restore_note: 'Restored note',
	delete_note_forever: 'Deleted note permanently',
	empty_note_trash: 'Emptied trash',
	list_note_versions: 'Read note history',
	restore_note_version: 'Restored note version',
	publish_note: 'Published note',
	discard_note_draft: 'Discarded note draft',
	create_todo: 'Created todo',
	create_todos: 'Created todos',
	update_todo: 'Updated todo',
	extract_promises: 'Found commitments',
	relate_selection: 'Linked selection',
	revise_mermaid_diagram: 'Revised diagram',
	promote_diagram: 'Kept diagram',
	accept_suggestion: 'Accepted suggestion',
	reject_suggestion: 'Dismissed suggestion',
	revert_suggestion: 'Undid suggestion',
	save_skill: 'Saved skill',
	edit_skill: 'Edited skill',
	create_skill: 'Created skill',
	create_skill_from_selection: 'Created skill from selection',
	restore_skill_version: 'Restored skill version',
	update_skill: 'Updated skill',
	set_skill_pinned: 'Changed skill pinning',
	propose_memory_change: 'Remembered',
	export_document: 'Exported document',
	create_diagram: 'Created diagram',
	edit_diagram: 'Edited diagram',
	update_export_settings: 'Updated export settings',
	download_artifact: 'Prepared download',
	delete_artifact: 'Deleted artifact',
	regenerate_artifact: 'Regenerated artifact',

	// Quiet in the turn summary, but the log still names every one of them.
	search: 'Searched',
	search_note: 'Searched within a note',
	ls: 'Listed files',
	grep: 'Searched notes and files',
	sed: 'Read file excerpt',
	search_icons: 'Searched icons',
	find_references: 'Found references',
	get_today_view: "Read today's work",
	get_artifact: 'Read artifact',
	get_export_settings: 'Read export settings',
	diff_note_versions: 'Compared note versions',
	read_canvas_diagram: 'Read canvas diagram',
	read_project_diagram: 'Read diagram',
	list_projects: 'Listed projects',
	list_todos: 'Listed todos',
	list_skills: 'Listed skills',
	list_skill_versions: 'Listed skill versions',
	list_artifacts: 'Listed artifacts',
	list_attachments: 'Listed attachments',
	list_templates: 'Listed templates',
	list_suggestions: 'Listed suggestions',
	list_trashed_notes: 'Listed trashed notes',
	list_user_memory: 'Read profile memory',
	list_project_memory: 'Read project memory',

	// Mechanism: the agent finding its footing, named all the same.
	search_tools: 'Looked up available tools',
	get_workspace_context: 'Read workspace context',
	load_skill: 'Read skill',
	list_tool_preferences: 'Read tool availability',
	set_tool_enabled: 'Changed tool availability',
	list_agent_models: 'Listed available models',
	get_agent_preferences: 'Read agent settings',
	update_agent_preferences: 'Changed agent settings',
	list_trust_policies: 'Read trust policies',
	update_trust_policy: 'Changed trust policy',
	list_api_tokens: 'Listed access tokens',
	revoke_api_token: 'Revoked access token'
};

const isCatalogTool = (name: string): name is AgentToolName => name in labels;

/**
 * The reader's name for a tool.
 *
 * The un-snake-casing survives for exactly one case: a name we have genuinely
 * never seen — an MCP tool from another host. It is no longer how the app's own
 * catalogue renders, which is what it had quietly become.
 */
export const friendlyToolLabel = (name: string): string =>
	isCatalogTool(name)
		? labels[name]
		: name
				.split('_')
				.map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
				.join(' ');

const completedToolLabel = (name: string): string =>
	isCatalogTool(name) ? completedLabels[name] : `${friendlyToolLabel(name)} completed`;

/**
 * Tools whose `noteId` argument is the subject of the row. "Read note" is true of every
 * such call and so tells the reader nothing; the title is the only part they can act on.
 */
const noteScopedTools = new Set([
	'get_note',
	'save_note',
	'edit_note',
	'publish_note',
	'discard_note_draft',
	'rename_note',
	'archive_note',
	'restore_note',
	'list_note_versions',
	'restore_note_version'
]);

/** Tools whose `query` argument is what the row is about. */
const querySubjectTools = new Set(['search', 'search_note', 'search_tools', 'find_references']);

/** Tools whose `pattern` argument is what the row is about. */
const patternSubjectTools = new Set(['grep']);

/** Tools whose `path` argument names the virtual file the row is about. */
const pathSubjectTools = new Set(['sed', 'ls']);

/**
 * The note a virtual file path points at, when it points at one. The scheme is
 * the server's (`AgentVirtualFiles`): notes and their version snapshots are the
 * only paths that resolve to something a person recognises, so anything else —
 * an attachment, a diagram, a directory — stays subject-less rather than
 * showing a uuid.
 */
export const noteIdFromPath = (path: string): string | undefined =>
	/^\/projects\/[^/]+\/notes\/([^/]+?)(?:\/versions\/\d+)?\.md$/.exec(path)?.[1];

const stringArgument = (arguments_: AgentPayloadObject, key: string): string | undefined => {
	const value = arguments_[key];
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

/** What the call answered with, by name — `undefined` for a call that has not settled. */
const outputFields = (tool: ChatToolActivity): ToolResultFields =>
	toolResultFields(toolOutput(tool));

/**
 * A row's label says what happened; its subject says what it happened to, and the subject is
 * the only part the reader can act on. They are returned apart so the row can make the
 * subject a control — concatenated into one sentence, a note title is unclickable prose.
 *
 * `noteId` is set only when opening it in a tab can actually succeed.
 */
export interface ToolStatusParts {
	readonly label: string;
	readonly subject?: string;
	readonly noteId?: string;
	/** True while the call is still in flight, so the row can show progress. */
	readonly pending: boolean;
	readonly failed: boolean;
}

/**
 * The shell is optional because the note tree may not be loaded, and a note may be missing
 * from it (archived, or outside the tree) — in which case the subject falls back to whatever
 * the call itself names, and to nothing rather than a placeholder for a name nobody can read.
 */
export function toolStatusParts(tool: ChatToolActivity, shell?: ShellContext): ToolStatusParts {
	const resolvedNote = noteScopedTools.has(tool.name)
		? noteTitle(shell, tool.arguments.noteId)
		: undefined;
	const pathArgument = pathSubjectTools.has(tool.name)
		? stringArgument(tool.arguments, 'path')
		: undefined;
	const pathNoteId = pathArgument ? noteIdFromPath(pathArgument) : undefined;
	// Same rule as `resolvedNote`: the id is offered only when the shell knows the
	// note, which is what makes opening it in a tab able to succeed.
	const resolvedPathNote = pathNoteId ? noteTitle(shell, pathNoteId) : undefined;
	const returned = outputFields(tool);
	const subject =
		resolvedNote ??
		resolvedPathNote ??
		(querySubjectTools.has(tool.name) ? stringArgument(tool.arguments, 'query') : undefined) ??
		(patternSubjectTools.has(tool.name) ? stringArgument(tool.arguments, 'pattern') : undefined) ??
		stringArgument(tool.arguments, 'title') ??
		stringArgument(tool.arguments, 'name') ??
		// A create names its subject only on the way back. Without this a note the agent
		// just made was "Created note" with nothing after it.
		returned.title ??
		returned.name;
	const noteId = resolvedNote
		? stringArgument(tool.arguments, 'noteId')
		: resolvedPathNote
			? pathNoteId
			: returned.noteId;
	// A failure the tool returned as a value counts. See `toolFailure`.
	const failure = toolFailure(tool);
	const parts = (label: string): ToolStatusParts => ({
		label,
		...(subject ? { subject } : {}),
		...(noteId ? { noteId } : {}),
		pending: tool.status === 'running',
		failed: failure !== undefined || tool.status === 'rejected'
	});

	if (tool.status === 'rejected')
		return parts(
			noteBodyTools.has(tool.name)
				? 'Note change rejected'
				: `${friendlyToolLabel(tool.name)} rejected`
		);
	if (failure !== undefined)
		return parts(
			noteBodyTools.has(tool.name) ? 'Note was not saved' : `${friendlyToolLabel(tool.name)} failed`
		);
	if (tool.status === 'succeeded') return parts(completedToolLabel(tool.name));
	return parts(friendlyToolLabel(tool.name));
}

/** The same thing as one string, for the places that cannot render the subject apart. */
export function toolStatusLabel(tool: ChatToolActivity, shell?: ShellContext): string {
	const { label, subject, pending } = toolStatusParts(tool, shell);
	const named = subject ? `${label} · ${subject}` : label;
	return pending ? `${named}…` : named;
}

/**
 * Tools that change something the user owns, as opposed to just reading it.
 *
 * Derived rather than listed. The hand-written list had drifted: every diagram
 * tool was missing from it, so a diagram write rendered in the muted tone the
 * row geometry reserves for reads, and `generate_document` was in it under a
 * name the catalogue no longer has.
 *
 * `ReadonlySet<string>` rather than `Set<RenderedTool>`: the labels are total
 * over the catalogue now, so the membership test takes any catalog name, while
 * the initializer still checks every entry is a rendered one.
 */
const readOnlyTools: ReadonlySet<string> = new Set<RenderedTool>([
	'get_project',
	'get_note',
	'list_note_versions',
	'download_artifact',
	'export_document'
]);

export const isWriteTool = (name: string): boolean =>
	isCatalogTool(name) &&
	!readOnlyTools.has(name) &&
	!mechanismTools.has(name) &&
	!quietTools.has(name);

/**
 * What the user loses by approving, for the calls where that is not obvious. Most writes are
 * plainly described by their own title, and a generic "this changes saved data" line under
 * every one of them trains the user to skip the line that matters.
 */
const consequences: Partial<Record<AgentToolName, string>> = {
	archive_note: 'This moves the note to the trash. You can restore it later.',
	delete_note_forever: 'This deletes the note permanently. It cannot be restored.',
	empty_note_trash: 'This deletes everything in the trash permanently.',
	restore_note_version:
		'This replaces the note’s current content. The version it replaces stays in the history.',
	archive_project: 'Archiving hides the project and everything in it. You can restore it later.',
	delete_artifact: 'This removes the artifact permanently.',
	discard_note_draft: 'Unpublished changes in this draft are lost.',
	regenerate_artifact: 'This replaces the current artifact.'
};

export const approvalConsequence = (name: string): string | undefined =>
	isCatalogTool(name) ? consequences[name] : undefined;

/**
 * What to show when a tool row is expanded. The disclosure used to repeat its own
 * trigger label, which told the user nothing they could not already see — so a
 * failure, otherwise the arguments the tool actually ran with.
 */
export function toolDetailLines(tool: ChatToolActivity): string[] {
	const failure = toolFailure(tool);
	if (failure) return [failure];
	const summaries = scalarSummaries(tool.arguments);
	if (summaries.length > 0) return summaries;
	// Identifiers and structured payloads are filtered out, so "no arguments" would be a
	// lie for a call that had some — it just had none worth reading.
	return Object.keys(tool.arguments).length > 0 ? ['No details to show.'] : ['No arguments.'];
}

export function scalarSummaries(arguments_: AgentPayloadObject): string[] {
	return Object.entries(arguments_)
		.filter(
			([key, value]) =>
				['string', 'number', 'boolean'].includes(typeof value) && !isIdentifierArgument(key, value)
		)
		.slice(0, 4)
		.map(([key, value]) => `${argumentLabel(key)}: ${String(value)}`);
}
