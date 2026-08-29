import type { ShellContext } from '$lib/models/workspace';
import { toolFailure, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import {
	argumentLabel,
	isIdentifierArgument,
	noteTitle
} from '../../chat/actions/tool-approval-fields';
import { mechanismTools, type RenderedTool } from './rendered-tools';

/** Tools that write the note body, and so speak about the note rather than themselves. */
const noteBodyTools = new Set(['save_note', 'edit_note']);

/**
 * What a call is called, in the reader's language, before and after it settles.
 *
 * `Record<RenderedTool, string>` and not a lookup with a fallback, which is the
 * whole point. The fallback un-snake-cased the tool's own function name, and it
 * covered 25 of the 44 tools that reach the transcript — so the shipped copy for
 * every diagram, skill, artifact, suggestion and memory action was a machine
 * name: "Edit diagram completed", "Propose memory change completed", "Revoke api
 * token completed". Nobody decided that; the map just had no entry and nothing
 * said so. Now a new tool that renders will not compile until someone writes
 * what it is called, and a tool that should never be named goes in
 * `quietTools` or `mechanismTools`, where hiding it is a decision in the diff.
 */
const labels: Record<RenderedTool, string> = {
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
	regenerate_artifact: 'Regenerate artifact'
};

const completedLabels: Record<RenderedTool, string> = {
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
	regenerate_artifact: 'Regenerated artifact'
};

const isRendered = (name: string): name is RenderedTool => name in labels;

/**
 * The reader's name for a tool.
 *
 * The un-snake-casing survives for exactly one case: a quiet or mechanism tool
 * that something asks to name anyway, and a name we have genuinely never seen —
 * an MCP tool from another host. It is no longer how the app's own catalogue
 * renders, which is what it had quietly become.
 */
export const friendlyToolLabel = (name: string): string =>
	isRendered(name)
		? labels[name]
		: name
				.split('_')
				.map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
				.join(' ');

const completedToolLabel = (name: string): string =>
	isRendered(name) ? completedLabels[name] : `${friendlyToolLabel(name)} completed`;

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

const stringArgument = (
	arguments_: Readonly<Record<string, unknown>>,
	key: string
): string | undefined => {
	const value = arguments_[key];
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const outputString = (tool: ChatToolActivity, key: string): string | undefined => {
	if (tool.status !== 'succeeded' || !isRecord(tool.output)) return undefined;
	const value = tool.output[key];
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

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
	const subject =
		resolvedNote ??
		(querySubjectTools.has(tool.name) ? stringArgument(tool.arguments, 'query') : undefined) ??
		stringArgument(tool.arguments, 'title') ??
		stringArgument(tool.arguments, 'name') ??
		// A create names its subject only on the way back. Without this a note the agent
		// just made was "Created note" with nothing after it.
		outputString(tool, 'title') ??
		outputString(tool, 'name');
	const noteId = resolvedNote
		? (tool.arguments.noteId as string)
		: (outputString(tool, 'noteId') ?? undefined);
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
 */
const readOnlyTools = new Set<RenderedTool>([
	'get_project',
	'get_note',
	'list_note_versions',
	'download_artifact',
	'export_document'
]);

export const isWriteTool = (name: string): boolean =>
	isRendered(name) && !readOnlyTools.has(name) && !mechanismTools.has(name);

/**
 * What the user loses by approving, for the calls where that is not obvious. Most writes are
 * plainly described by their own title, and a generic "this changes saved data" line under
 * every one of them trains the user to skip the line that matters.
 */
const consequences: Partial<Record<RenderedTool, string>> = {
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
	isRendered(name) ? consequences[name] : undefined;

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

export function scalarSummaries(arguments_: Readonly<Record<string, unknown>>): string[] {
	return Object.entries(arguments_)
		.filter(
			([key, value]) =>
				['string', 'number', 'boolean'].includes(typeof value) && !isIdentifierArgument(key, value)
		)
		.slice(0, 4)
		.map(([key, value]) => `${argumentLabel(key)}: ${String(value)}`);
}
