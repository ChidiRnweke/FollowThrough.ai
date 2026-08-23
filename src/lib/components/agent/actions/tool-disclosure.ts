import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import {
	argumentLabel,
	isIdentifierArgument,
	noteTitle
} from '../../chat/actions/tool-approval-fields';
import { explainToolFailure } from './tool-result';

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

export type ToolDisclosure =
	/** Mechanism. Never rendered at all, so it never reaches a row. */
	| { readonly kind: 'none' }
	/** One thing, read. The row opens it; there is nothing to unfold. */
	| { readonly kind: 'link'; readonly entity: EntityRef }
	/** Many things, read. What came back, as rows of their own kind. */
	| { readonly kind: 'collection'; readonly entities: readonly EntityRef[]; readonly total: number }
	/** A note or skill body rewritten. The one family with a true before and after. */
	| { readonly kind: 'note-diff'; readonly noteId: string; readonly revision?: number }
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

	// One thing, read. The row is the link.
	get_note: 'link',
	get_project: 'link',
	get_artifact: 'link',
	load_skill: 'link',
	read_attachment: 'link',
	// Many things, read: a list of icons to choose from.
	search_icons: 'collection',
	// One stored version, read back whole.
	read_note_version: 'link',
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
	present_diagram: 'proposal',
	present_diagram_revision: 'proposal',
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
	list_note_versions: 'note',
	read_note_version: 'note',
	diff_note_versions: 'note',
	create_note: 'note',
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
	list_skill_versions: 'skill',
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
	read_attachment: 'artifact',
	list_project_memory: 'memory',
	list_user_memory: 'memory',
	propose_memory_change: 'memory',
	list_suggestions: 'suggestion',
	promote_diagram: 'note',
	present_diagram: 'note',
	present_diagram_revision: 'note',
	read_project_diagram: 'note',
	read_canvas_diagram: 'note',
	search_icons: 'note',
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const idKeys = ['noteId', 'todoId', 'projectId', 'entryId', 'artifactId', 'suggestionId', 'id'];

const identify = (source: Record<string, unknown>): string | undefined => {
	for (const key of idKeys) {
		const found = asString(source[key]);
		if (found) return found;
	}
	return undefined;
};

const nameIn = (source: Record<string, unknown>): string | undefined =>
	asString(source.title) ?? asString(source.name) ?? asString(source.content);

/** The array a collection result is actually in — top level, or one key down (`{ todos: [...] }`). */
const collectionOf = (output: unknown): readonly unknown[] | undefined => {
	if (Array.isArray(output)) return output;
	if (!isRecord(output)) return undefined;
	return Object.values(output).find(Array.isArray);
};

const entityFrom = (value: unknown, kind: EntityKind, shell?: ShellContext): EntityRef => {
	if (!isRecord(value)) {
		const title = asString(value);
		return { kind, title: title ?? placeholder[kind], named: title !== undefined };
	}
	const id = identify(value);
	// A note the shell already knows beats whatever the payload called it: the tree carries the
	// title the user last saw, and a stale echo of an old one reads as the wrong note.
	const resolved =
		kind === 'note' || kind === 'skill' ? (noteTitle(shell, id) ?? nameIn(value)) : nameIn(value);
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
	const output = isRecord(tool.output) ? tool.output : {};
	const merged = { ...tool.arguments, ...output };
	return entityFrom(merged, kind, shell);
};

/**
 * What the call set, from the arguments — the one place that says which fields were meant to
 * change, since every mutating tool returns the record whole and says nothing about which part
 * of it moved. `previous`, where a tool troubles to return it, supplies the before.
 */
const changesFrom = (tool: ChatToolActivity): readonly FieldChange[] => {
	const previous =
		isRecord(tool.output) && isRecord(tool.output.previous) ? tool.output.previous : undefined;
	return Object.entries(tool.arguments)
		.filter(
			([key, value]) => !isIdentifierArgument(key, value) && value !== undefined && value !== null
		)
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
	if (collectionOf(tool.output)) return 'collection';
	if (isRecord(tool.output) && Object.keys(tool.output).length > 0) return 'record';
	return 'none';
};

export function toolDisclosure(tool: ChatToolActivity, shell?: ShellContext): ToolDisclosure {
	// A failure outranks the family. Whatever the call was going to show, what it has to say now
	// is that it did not happen, and what the reader can do about that.
	if (tool.failure) return { kind: 'failure', explanation: explainToolFailure(tool.failure) };

	const family = families[tool.name] ?? shapeGuess(tool);
	const kind = kinds[tool.name] ?? 'plain';

	switch (family) {
		case 'none':
			return { kind: 'none' };

		case 'link':
			return { kind: 'link', entity: subjectOf(tool, kind, shell) };

		case 'collection': {
			const items = collectionOf(tool.output) ?? [];
			return {
				kind: 'collection',
				entities: items.slice(0, ITEM_CAP).map((item) => entityFrom(item, kind, shell)),
				total: items.length
			};
		}

		case 'note-diff': {
			const output = isRecord(tool.output) ? tool.output : {};
			const noteId = asString(output.noteId) ?? asString(tool.arguments.noteId);
			// Without a note to diff there is nothing this family can render, so it falls back to
			// stating what was sent rather than opening onto an apology.
			if (!noteId) return { kind: 'record', changed: changesFrom(tool) };
			const revision = output.currentRevision;
			return {
				kind: 'note-diff',
				noteId,
				...(typeof revision === 'number' ? { revision } : {})
			};
		}

		case 'record': {
			const entity = subjectOf(tool, kind, shell);
			return {
				kind: 'record',
				...(entity.id || entity.named ? { entity } : {}),
				changed: changesFrom(tool)
			};
		}

		case 'created': {
			const items = collectionOf(tool.output);
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
