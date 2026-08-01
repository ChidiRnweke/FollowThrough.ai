import type { ShellContext } from '$lib/models';
import type { ChatToolActivity } from '$lib/stores/chat-tools';
import { argumentLabel, isIdentifierArgument, noteTitle } from './tool-approval-fields';

/** Tools that write the note body, and so speak about the note rather than themselves. */
const noteBodyTools = new Set(['save_note', 'edit_note']);

const labels: Readonly<Record<string, string>> = {
	save_note: 'Save note',
	edit_note: 'Edit note',
	publish_note: 'Publish note',
	discard_note_draft: 'Discard note draft',
	create_note: 'Create note',
	rename_note: 'Rename note',
	archive_note: 'Archive note',
	create_project: 'Create project',
	rename_project: 'Rename project',
	archive_project: 'Archive project',
	create_todo: 'Create todo',
	create_todos: 'Create todos',
	update_todo: 'Update todo',
	get_note: 'Read note'
};

const completedLabels: Readonly<Record<string, string>> = {
	create_note: 'Created note',
	rename_note: 'Renamed note',
	archive_note: 'Archived note',
	create_project: 'Created project',
	rename_project: 'Renamed project',
	archive_project: 'Archived project',
	create_todo: 'Created todo',
	create_todos: 'Created todos',
	update_todo: 'Updated todo',
	get_note: 'Read note'
};

export const friendlyToolLabel = (name: string): string =>
	labels[name] ??
	name
		.split('_')
		.map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
		.join(' ');

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
	'archive_note'
]);

/**
 * The shell is optional because the note tree may not be loaded, and a note may be missing
 * from it (archived, or outside the tree) — in which case the row keeps the plain label
 * rather than showing a placeholder for a name nobody can read.
 */
export function toolStatusLabel(tool: ChatToolActivity, shell?: ShellContext): string {
	const title = noteScopedTools.has(tool.name)
		? noteTitle(shell, tool.arguments.noteId)
		: undefined;
	const named = (label: string): string => (title ? `${label} · ${title}` : label);

	if (tool.status === 'running') return `${named(friendlyToolLabel(tool.name))}…`;
	if (tool.status === 'rejected')
		return named(
			noteBodyTools.has(tool.name)
				? 'Note change rejected'
				: `${friendlyToolLabel(tool.name)} rejected`
		);
	if (tool.status === 'failed')
		return named(
			noteBodyTools.has(tool.name) ? 'Note was not saved' : `${friendlyToolLabel(tool.name)} failed`
		);
	if (tool.status === 'succeeded') {
		if (tool.name === 'save_note') return named('Saved note');
		if (tool.name === 'edit_note') return named('Edited note');
		if (tool.name === 'publish_note') return named('Published note');
		if (tool.name === 'discard_note_draft') return named('Discarded note draft');
		return named(completedLabels[tool.name] ?? `${friendlyToolLabel(tool.name)} completed`);
	}
	return named(friendlyToolLabel(tool.name));
}

/** Tools that change something the user owns, as opposed to just reading it. */
const writeTools = new Set([
	'save_note',
	'edit_note',
	'publish_note',
	'discard_note_draft',
	'create_note',
	'rename_note',
	'archive_note',
	'create_project',
	'rename_project',
	'archive_project',
	'create_todo',
	'create_todos',
	'update_todo',
	'generate_document',
	'delete_artifact',
	'regenerate_artifact'
]);

export const isWriteTool = (name: string): boolean => writeTools.has(name);

/**
 * What the user loses by approving, for the calls where that is not obvious. Most writes are
 * plainly described by their own title, and a generic "this changes saved data" line under
 * every one of them trains the user to skip the line that matters.
 */
const consequences: Readonly<Record<string, string>> = {
	archive_note: 'Archiving hides the note from the workspace. You can restore it later.',
	archive_project: 'Archiving hides the project and everything in it. You can restore it later.',
	delete_artifact: 'This removes the artifact permanently.',
	discard_note_draft: 'Unpublished changes in this draft are lost.',
	regenerate_artifact: 'This replaces the current artifact.'
};

export const approvalConsequence = (name: string): string | undefined => consequences[name];

/**
 * What to show when a tool row is expanded. The disclosure used to repeat its own
 * trigger label, which told the user nothing they could not already see — so a
 * failure, otherwise the arguments the tool actually ran with.
 */
export function toolDetailLines(tool: ChatToolActivity): string[] {
	if (tool.failure) return [tool.failure];
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
