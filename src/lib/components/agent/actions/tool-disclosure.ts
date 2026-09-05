import type { ShellContext } from '$lib/models/workspace';
import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import {
	argumentLabel,
	isIdentifierArgument,
	noteTitle
} from '../../chat/actions/tool-approval-fields';
import { explainToolFailure } from './tool-result';
import { toolResultFields, type ToolResultFields } from './tool-result-fields';
import { noteIdFromPath } from './tool-presentation';
import {
	agentPayloadItems,
	isAgentPayloadObject,
	type AgentPayload
} from '$lib/models/agent/payload';

/**
 * What, if anything, sits behind a call's disclosure — and therefore whether it gets a
 * chevron at all.
 *
 * Every row used to have one, and most of them opened onto a restatement of the row. A
 * settled `save_note` returns `{ noteId, title, currentRevision }`: the id is dropped as an
 * identifier, the revision as noise, and the panel that opens says `Title: second note` under
 * a row that already said `Saved note · second note`. A chevron that pays out nothing teaches
 * the reader not to open the next one, including the one that would have shown a real change.
 *
 * So disclosure is earned by payload. A read of one thing is a link and takes no chevron; a
 * read of many shows what came back; a write shows what changed. There is deliberately no
 * generic "arguments and result" bucket, because that is the same empty chevron one level
 * down.
 *
 * Classification is by the shape of the thing the call touched rather than by the call, which
 * is what keeps the catalog's 72 tools down to seven renderers. An unrecognised name still
 * lands somewhere: the result's own shape decides, the same way `tool-result.ts` reads a
 * payload it was never told about.
 */

export type EntityKind =
	| 'note'
	| 'todo'
	| 'project'
	| 'skill'
	| 'diagram'
	| 'artifact'
	| 'memory'
	| 'suggestion'
	| 'setting'
	/** Something worth naming that has nowhere to be opened — a model, a template, a token. */
	| 'plain';

export interface EntityRef {
	readonly kind: EntityKind;
	/** Set only when the thing can actually be opened. */
	readonly id?: string;
	readonly title: string;
	/** False when `title` is a stand-in, so a caller can try to resolve the real one. */
	readonly named: boolean;
}

export interface FieldChange {
	readonly label: string;
	/** Absent when no before-image is available; the row then states the value it was set to. */
	readonly from?: string;
	readonly to: string;
}

/** One line of what a look inside the virtual files came back with. */
export interface FileOutputLine {
	readonly text: string;
	/** Where the line sits — a line number or the note it matched in — when known. */
	readonly context?: string;
}

export type ToolDisclosure =
	/** Mechanism. Never rendered at all, so it never reaches a row. */
	| { readonly kind: 'none' }
	/** One thing, read. The row opens it; there is nothing to unfold. */
	| { readonly kind: 'link'; readonly entity: EntityRef }
	/** Many things, read. What came back, as rows of their own kind. */
	| { readonly kind: 'collection'; readonly entities: readonly EntityRef[]; readonly total: number }
	/** A note or skill body rewritten. The one family with a true before and after. */
	| {
			readonly kind: 'note-diff';
			readonly noteId: string;
			readonly revision?: number;
			/** The note the diff is about, resolved once here so the body can name and open it. */
			readonly entity: EntityRef;
	  }
	/** A look inside the virtual files — a grep, a sed excerpt, an ls — with what came back. */
	| {
			readonly kind: 'file-output';
			readonly headline: string;
			readonly lines: readonly FileOutputLine[];
	  }
	/** Fields set on a record that already existed. */
	| {
			readonly kind: 'record';
			readonly entity?: EntityRef;
			readonly changed: readonly FieldChange[];
	  }
	/** Things that did not exist before this call. */
	| { readonly kind: 'created'; readonly entities: readonly EntityRef[] }
	/** A thing's existence changed — trashed, restored, deleted for good. */
	| { readonly kind: 'lifecycle'; readonly entity?: EntityRef; readonly recoverable: boolean }
	/**
	 * Work put up for review rather than applied. A memory proposal carries what it proposed,
	 * because the judgement is against the set it would join rather than against the sentence
	 * on its own — "remember that Chidi prefers X" is only decidable next to what is already
	 * remembered.
	 */
	| {
			readonly kind: 'proposal';
			readonly scope: 'memory' | 'suggestion';
			readonly projectId?: string;
			readonly operation?: string;
			readonly content?: string;
	  }
	/** Something went wrong, said in the reader's terms. */
	| { readonly kind: 'failure'; readonly explanation: string };

type Family = Exclude<ToolDisclosure['kind'], 'failure'>;

/**
 * The catalog, by family. Total over `TOOL_DESCRIPTIONS` — the spec beside this file asserts
 * it, so a tool added later cannot quietly fall through to a shape guess.
 */
const families: Readonly<Record<string, Family>> = {
	// Mechanism: the agent orienting itself. Never earns a row, let alone a chevron.
	search_tools: 'none',
	use_tool: 'none',

	// A look inside the virtual files: the row says what it looked for, the
	// disclosure shows what came back.
	ls: 'file-output',
	grep: 'file-output',
	sed: 'file-output',

	// One thing, read. The row is the link.
	get_note: 'link',
	get_project: 'link',
	get_artifact: 'link',
	load_skill: 'link',
	// Many things, read: a list of icons to choose from.
	search_icons: 'collection',
	// One stored version, read back whole.
	read_canvas_diagram: 'link',
	read_project_diagram: 'link',
	download_artifact: 'link',

	// Many things, read.
	search: 'collection',
	search_note: 'collection',
	get_today_view: 'collection',
	get_workspace_context: 'collection',
	list_projects: 'collection',
	list_todos: 'collection',
	list_trashed_notes: 'collection',
	list_note_versions: 'collection',
	list_suggestions: 'collection',
	list_skills: 'collection',
	list_skill_versions: 'collection',
	list_attachments: 'collection',
	list_artifacts: 'collection',
	list_templates: 'collection',
	list_agent_models: 'collection',
	list_api_tokens: 'collection',
	list_tool_preferences: 'collection',
	list_trust_policies: 'collection',
	list_project_memory: 'collection',
	list_user_memory: 'collection',

	// A body rewritten. Skills are notes underneath and carry a `noteId` the same way.
	create_note: 'note-diff',
	save_note: 'note-diff',
	edit_note: 'note-diff',
	restore_note_version: 'note-diff',
	// The one read with a true before and after.
	diff_note_versions: 'note-diff',
	publish_note: 'note-diff',
	discard_note_draft: 'note-diff',
	create_skill: 'note-diff',
	create_skill_from_selection: 'note-diff',
	save_skill: 'note-diff',
	edit_skill: 'note-diff',
	restore_skill_version: 'note-diff',

	// Fields set on something that already existed.
	update_todo: 'record',
	rename_note: 'record',
	rename_project: 'record',
	update_skill: 'record',
	set_skill_pinned: 'record',
	move_project_entry: 'record',
	get_agent_preferences: 'record',
	update_agent_preferences: 'record',
	get_export_settings: 'record',
	update_export_settings: 'record',
	set_tool_enabled: 'record',
	update_trust_policy: 'record',

	// Brought into existence.
	create_todo: 'created',
	create_todos: 'created',
	create_project: 'created',
	create_folder: 'created',
	promote_diagram: 'created',
	export_document: 'created',
	regenerate_artifact: 'created',

	// Existence changed.
	archive_note: 'lifecycle',
	restore_note: 'lifecycle',
	archive_project: 'lifecycle',
	delete_note_forever: 'lifecycle',
	empty_note_trash: 'lifecycle',
	delete_artifact: 'lifecycle',
	revoke_api_token: 'lifecycle',

	// Put up for review rather than applied.
	extract_promises: 'proposal',
	relate_selection: 'proposal',
	find_references: 'proposal',
	generate_mermaid_diagram: 'proposal',
	// Shown on the canvas rather than saved: the user is the one who keeps it.
	//
	// `proposal` here is a *rendering* family — what this reads as once it has
	// happened — not the approval classification of the same name in
	// `agentToolCoverage`, where this tool is `read` because it mutates nothing.
	// The two answer different questions and are meant to differ.
	create_diagram: 'proposal',
	edit_diagram: 'proposal',
	revise_mermaid_diagram: 'proposal',
	propose_memory_change: 'proposal',
	accept_suggestion: 'proposal',
	reject_suggestion: 'proposal',
	revert_suggestion: 'proposal'
};

/** What kind of thing a call is about, where the family alone does not say. */
const kinds: Readonly<Record<string, EntityKind>> = {
	get_note: 'note',
	search: 'note',
	search_note: 'note',
	list_trashed_notes: 'note',
	// A revision, not the note. Their ids are `NoteRevisionId`s, and typing them as
	// notes made every row in a history listing offer to open a note tab that
	// cannot load. `plain` names them without pretending they go anywhere.
	list_note_versions: 'plain',
	diff_note_versions: 'note',
	create_note: 'note',
	save_note: 'note',
	edit_note: 'note',
	publish_note: 'note',
	discard_note_draft: 'note',
	restore_note_version: 'note',
	archive_note: 'note',
	restore_note: 'note',
	delete_note_forever: 'note',
	empty_note_trash: 'note',
	rename_note: 'note',
	get_today_view: 'todo',
	list_todos: 'todo',
	create_todo: 'todo',
	create_todos: 'todo',
	update_todo: 'todo',
	get_project: 'project',
	list_projects: 'project',
	create_project: 'project',
	create_folder: 'project',
	rename_project: 'project',
	archive_project: 'project',
	move_project_entry: 'project',
	get_workspace_context: 'project',
	load_skill: 'skill',
	list_skills: 'skill',
	list_skill_versions: 'plain',
	create_skill: 'skill',
	create_skill_from_selection: 'skill',
	save_skill: 'skill',
	edit_skill: 'skill',
	restore_skill_version: 'skill',
	update_skill: 'skill',
	set_skill_pinned: 'skill',
	get_artifact: 'artifact',
	download_artifact: 'artifact',
	list_artifacts: 'artifact',
	list_templates: 'artifact',
	export_document: 'artifact',
	regenerate_artifact: 'artifact',
	delete_artifact: 'artifact',
	list_attachments: 'artifact',
	list_project_memory: 'memory',
	list_user_memory: 'memory',
	propose_memory_change: 'memory',
	list_suggestions: 'suggestion',
	// Diagrams were typed as notes, so `promote_diagram`'s result — a diagram id —
	// was offered as a note to open, and `openTab` would have loaded a note that
	// does not exist. They have their own tab kind and their own route.
	promote_diagram: 'diagram',
	create_diagram: 'diagram',
	edit_diagram: 'diagram',
	revise_mermaid_diagram: 'diagram',
	read_project_diagram: 'diagram',
	read_canvas_diagram: 'diagram',
	// Not a diagram: it searches an icon set, and its results are icons.
	search_icons: 'plain',
	get_agent_preferences: 'setting',
	update_agent_preferences: 'setting',
	get_export_settings: 'setting',
	update_export_settings: 'setting',
	set_tool_enabled: 'setting',
	update_trust_policy: 'setting',
	list_tool_preferences: 'setting',
	list_trust_policies: 'setting',
	revoke_api_token: 'setting'
};

/** What to call a thing whose name would not resolve. It still opens; it just has no title. */
const placeholder: Readonly<Record<EntityKind, string>> = {
	note: 'A note',
	todo: 'A todo',
	project: 'A project',
	skill: 'A skill',
	diagram: 'A diagram',
	artifact: 'A file',
	memory: 'A remembered fact',
	suggestion: 'A suggestion',
	setting: 'A setting',
	plain: 'An item'
};

/** Calls whose subject survives them, so the row can still offer to open it. */
const recoverableAfter = new Set(['archive_note', 'archive_project', 'restore_note']);

/** At most this many rows behind a disclosure; the rest are counted. Matches `tool-result.ts`. */
const ITEM_CAP = 5;

const asString = (value: AgentPayload | undefined): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

/**
 * The id a payload offers, most specific first. `id` is last because a result
 * that carries both a typed id and a bare one means the typed one.
 */
const identify = (fields: ToolResultFields): string | undefined =>
	fields.noteId ??
	fields.todoId ??
	fields.diagramId ??
	fields.projectId ??
	fields.entryId ??
	fields.artifactId ??
	fields.suggestionId ??
	fields.id;

const nameIn = (fields: ToolResultFields): string | undefined =>
	fields.title ?? fields.name ?? fields.content;

/** The array a collection result is actually in — top level, or one key down (`{ todos: [...] }`). */
const collectionOf = (output: AgentPayload | undefined): readonly AgentPayload[] | undefined => {
	if (output === undefined) return undefined;
	const top = agentPayloadItems(output);
	if (top) return top;
	if (!isAgentPayloadObject(output)) return undefined;
	return Object.values(output)
		.map(agentPayloadItems)
		.find((nested) => nested !== undefined);
};

const entityFrom = (value: AgentPayload, kind: EntityKind, shell?: ShellContext): EntityRef => {
	if (!isAgentPayloadObject(value)) {
		const title = asString(value);
		return { kind, title: title ?? placeholder[kind], named: title !== undefined };
	}
	const fields = toolResultFields(value);
	const id = identify(fields);
	// A note the shell already knows beats whatever the payload called it: the tree carries the
	// title the user last saw, and a stale echo of an old one reads as the wrong note.
	const resolved =
		kind === 'note' || kind === 'skill' ? (noteTitle(shell, id) ?? nameIn(fields)) : nameIn(fields);
	return {
		kind,
		...(id ? { id } : {}),
		title: resolved ?? placeholder[kind],
		named: resolved !== undefined
	};
};

/**
 * The subject of a call, preferring what came back to what went out. A create names its result
 * only on the way back — the id it can be opened by exists in the output and nowhere else.
 */
const subjectOf = (tool: ChatToolActivity, kind: EntityKind, shell?: ShellContext): EntityRef => {
	const returned = toolOutput(tool);
	// A result that is not an object contributes no fields to merge, and the
	// arguments are then the whole of what is known about the subject. Stated as
	// the absence it is, rather than as an empty record standing in for one — the
	// two are the same merge, but only one of them is readable as a decision.
	const named = returned !== undefined && isAgentPayloadObject(returned) ? returned : undefined;
	return entityFrom(named ? { ...tool.arguments, ...named } : tool.arguments, kind, shell);
};

/**
 * What the call set, from the arguments — the one place that says which fields were meant to
 * change, since every mutating tool returns the record whole and says nothing about which part
 * of it moved. `previous`, where a tool troubles to return it, supplies the before.
 */
const changesFrom = (tool: ChatToolActivity): readonly FieldChange[] => {
	const output = toolOutput(tool);
	const previous =
		output !== undefined && isAgentPayloadObject(output) && isAgentPayloadObject(output.previous)
			? output.previous
			: undefined;
	// No `!== undefined` guard: a `AgentPayload` has no such member, which is one of
	// the checks naming the wire type retires outright.
	return Object.entries(tool.arguments)
		.filter(([key, value]) => !isIdentifierArgument(key, value) && value !== null)
		.map(([key, value]) => {
			const from = previous ? asString(String(previous[key] ?? '')) : undefined;
			return {
				label: argumentLabel(key),
				...(from !== undefined ? { from } : {}),
				to: String(value)
			};
		});
};

const shapeGuess = (tool: ChatToolActivity): Family => {
	const output = toolOutput(tool);
	if (collectionOf(output)) return 'collection';
	if (output !== undefined && isAgentPayloadObject(output) && Object.keys(output).length > 0)
		return 'record';
	return 'none';
};

/**
 * What a look inside the virtual files came back with. The wire shapes are the
 * `AgentGrepResult` / `AgentSedResult` / `AgentLsResult` unions from
 * `$lib/models/agent-files`, read off the payload the run journalled. A call
 * still running has produced nothing, so it earns no chevron yet — the same
 * "disclosure is earned" rule the rest of this file follows.
 */
const fileOutput = (tool: ChatToolActivity, shell?: ShellContext): ToolDisclosure => {
	const output = toolOutput(tool);
	if (output === undefined || !isAgentPayloadObject(output)) return { kind: 'none' };

	if (output.kind === 'error')
		return {
			kind: 'file-output',
			headline: asString(output.message) ?? 'The file could not be read.',
			lines: []
		};

	if (output.kind === 'matches') {
		const matches = agentPayloadItems(output.matches) ?? [];
		return {
			kind: 'file-output',
			headline: matches.length === 1 ? '1 match' : `${matches.length} matches`,
			lines: matches.flatMap((match) => {
				if (!isAgentPayloadObject(match)) return [];
				const line = match.line;
				if (typeof line !== 'string') return [];
				const path = asString(match.path);
				const title = path ? noteTitle(shell, noteIdFromPath(path)) : undefined;
				const source = title ? `${title} (${path})` : path;
				const context =
					typeof match.lineNumber === 'number'
						? source
							? `${source}:${match.lineNumber}`
							: `Line ${match.lineNumber}`
						: source;
				return [{ text: line, ...(context ? { context } : {}) }];
			})
		};
	}

	if (output.kind === 'no_matches')
		return { kind: 'file-output', headline: 'No matches', lines: [] };

	if (output.kind === 'content') {
		const content = typeof output.content === 'string' ? output.content : '';
		const start = typeof output.startLine === 'number' ? output.startLine : undefined;
		const end = typeof output.endLine === 'number' ? output.endLine : undefined;
		return {
			kind: 'file-output',
			headline: start !== undefined && end !== undefined ? `Lines ${start}–${end}` : 'File excerpt',
			lines: content.split('\n').map((text, index) => ({
				text,
				...(start === undefined ? {} : { context: String(start + index) })
			}))
		};
	}

	if (output.kind === 'listed') {
		const entries = agentPayloadItems(output.entries) ?? [];
		return {
			kind: 'file-output',
			headline: entries.length === 1 ? '1 entry' : `${entries.length} entries`,
			lines: entries.flatMap((entry) => {
				if (!isAgentPayloadObject(entry)) return [];
				const path = asString(entry.path);
				if (!path) return [];
				return [{ text: noteTitle(shell, noteIdFromPath(path)) ?? path }];
			})
		};
	}

	// An output shape this family does not recognise says nothing honest, so the
	// row stays flat rather than opening onto a guess.
	return { kind: 'none' };
};

export function toolDisclosure(tool: ChatToolActivity, shell?: ShellContext): ToolDisclosure {
	// A failure outranks the family. Whatever the call was going to show, what it has to say now
	// is that it did not happen, and what the reader can do about that.
	const failure = toolFailure(tool);
	if (failure) return { kind: 'failure', explanation: explainToolFailure(failure) };

	const family = families[tool.name] ?? shapeGuess(tool);
	const kind = kinds[tool.name] ?? 'plain';

	switch (family) {
		case 'none':
			return { kind: 'none' };

		case 'link':
			return { kind: 'link', entity: subjectOf(tool, kind, shell) };

		case 'collection': {
			const items = collectionOf(toolOutput(tool)) ?? [];
			return {
				kind: 'collection',
				entities: items.slice(0, ITEM_CAP).map((item) => entityFrom(item, kind, shell)),
				total: items.length
			};
		}

		case 'note-diff': {
			const returned = toolResultFields(toolOutput(tool));
			const noteId = returned.noteId ?? asString(tool.arguments.noteId);
			// Without a note to diff there is nothing this family can render, so it falls back to
			// stating what was sent rather than opening onto an apology.
			if (!noteId) return { kind: 'record', changed: changesFrom(tool) };
			const { currentRevision } = returned;
			return {
				kind: 'note-diff',
				noteId,
				...(currentRevision === undefined ? {} : { revision: currentRevision }),
				entity: subjectOf(tool, kind, shell)
			};
		}

		case 'file-output':
			return fileOutput(tool, shell);

		case 'record': {
			const entity = subjectOf(tool, kind, shell);
			return {
				kind: 'record',
				...(entity.id || entity.named ? { entity } : {}),
				changed: changesFrom(tool)
			};
		}

		case 'created': {
			const items = collectionOf(toolOutput(tool));
			return {
				kind: 'created',
				entities: items
					? items.map((item) => entityFrom(item, kind, shell))
					: [subjectOf(tool, kind, shell)]
			};
		}

		case 'lifecycle': {
			const entity = subjectOf(tool, kind, shell);
			return {
				kind: 'lifecycle',
				...(entity.id || entity.named ? { entity } : {}),
				recoverable: recoverableAfter.has(tool.name)
			};
		}

		case 'proposal': {
			if (kind !== 'memory') return { kind: 'proposal', scope: 'suggestion' };
			const projectId = asString(tool.arguments.projectId);
			const operation = asString(tool.arguments.operation);
			const content = asString(tool.arguments.content);
			return {
				kind: 'proposal',
				scope: 'memory',
				...(projectId ? { projectId } : {}),
				...(operation ? { operation } : {}),
				...(content ? { content } : {})
			};
		}
	}
}

/**
 * Whether a row should carry a chevron. `none` has nothing behind it and `link` puts what it
 * has on the row itself, so both stay flat — which is most calls in most turns.
 */
export const opensInPlace = (disclosure: ToolDisclosure): boolean =>
	disclosure.kind !== 'none' && disclosure.kind !== 'link';

/**
 * The family a tool was explicitly given, or `undefined` if it would fall through to a guess
 * at its payload. Exported for the spec that holds this map total over the catalog: a guess is
 * a reasonable last resort for a name we have never seen, and a bug for one shipped in
 * `TOOL_DESCRIPTIONS`.
 */
export const toolFamily = (name: string): Family | undefined => families[name];
