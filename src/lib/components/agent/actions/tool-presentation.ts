import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { ShellContext } from '$lib/models/workspace';
import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { isAgentPayloadObject, type AgentPayloadObject } from '$lib/models/agent/payload';
import { argumentLabel, isIdentifierArgument } from '../../chat/actions/tool-approval-fields';
import { mechanismTools, quietTools, type RenderedTool } from './rendered-tools';
import { friendlyToolLabel, completedToolLabel, isCatalogTool } from './tool-labels';
export { friendlyToolLabel } from './tool-labels';
import { toolEntity, fileEntity } from './tool-entities';

/** Tools that write the note body, and so speak about the note rather than themselves. */
const noteBodyTools = new Set(['save_note', 'edit_note']);

/** A note virtual path retains its source identity outside the current shell tree. */
export const noteIdFromPath = (path: string): string | undefined =>
	/^\/projects\/[^/]+\/notes\/([^/]+?)(?:\/versions\/\d+)?\.md$/.exec(path)?.[1];

const stringArgument = (args: AgentPayloadObject, key: string): string | undefined =>
	typeof args[key] === 'string' && args[key].trim() ? args[key] : undefined;

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
	const entity = toolEntity(tool, shell);
	const path = stringArgument(tool.arguments, 'path');
	const query =
		stringArgument(tool.arguments, 'query') ?? stringArgument(tool.arguments, 'pattern');
	const subject =
		query ??
		(entity.named ? entity.title : undefined) ??
		stringArgument(tool.arguments, 'title') ??
		stringArgument(tool.arguments, 'name') ??
		(path ? fileEntity(path, shell).title : undefined);
	const noteId =
		entity.kind === 'note' || entity.kind === 'skill'
			? entity.id
			: path
				? noteIdFromPath(path)
				: undefined;

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
	if (tool.status === 'succeeded') {
		const output = toolOutput(tool);
		if (
			tool.name === 'propose_memory_change' &&
			output !== undefined &&
			isAgentPayloadObject(output) &&
			isAgentPayloadObject(output.appliedEntry)
		)
			return parts('Updated memory');
		return parts(completedToolLabel(tool.name));
	}
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
