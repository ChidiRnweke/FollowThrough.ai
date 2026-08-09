import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { noteTitle } from '../../chat/actions/tool-approval-fields';

/**
 * What a turn did, in terms of the user's own things.
 *
 * A transcript that lists tool calls is a log, and a log in the reading path teaches the
 * reader to skip everything in it — including the approval that matters. One instruction
 * ("shorten this note") ran four calls, three of which were the agent orienting itself: a
 * tool search, a wrapper rejection, and the retry that fixed it. None of that is work on the
 * workspace, and none of it is the user's business.
 *
 * So a turn reports the things it touched, deduplicated, each openable, and everything else
 * lives behind the turn's own details.
 */

export type TouchedKind = 'note' | 'todo' | 'project' | 'skill';

export interface TouchedThing {
	readonly kind: TouchedKind;
	/** Set only when the thing can actually be opened. */
	readonly id?: string;
	readonly title: string;
	/** False when `title` is a placeholder, so a caller can try to resolve the real one. */
	readonly named: boolean;
	/** What became of it: `edited`, `read`, `created`, … */
	readonly verb: string;
	readonly pending: boolean;
	readonly failed: boolean;
}

export interface TurnActivity {
	readonly touched: readonly TouchedThing[];
	/**
	 * Calls that failed and that nothing later made good. The whole activity is returned
	 * rather than its message, so the failure can be stated as what happened to which thing
	 * instead of as the sentence the run happened to produce.
	 */
	readonly failures: readonly ChatToolActivity[];
	/** Every call the turn made, mechanism included — what the details door is for. */
	readonly callCount: number;
}

/**
 * Calls that are the agent finding its footing rather than work on the workspace. A row
 * reading "Search tools" is not reassurance, and it is not something anyone can act on.
 */
const mechanismTools = new Set([
	'search_tools',
	'use_tool',
	'get_workspace_context',
	'load_skill',
	'list_tool_preferences',
	'set_tool_enabled',
	'list_agent_models',
	'get_agent_preferences',
	'update_agent_preferences',
	'list_trust_policies',
	'update_trust_policy',
	'list_api_tokens',
	'revoke_api_token'
]);

interface ToolSubject {
	readonly kind: TouchedKind;
	readonly verb: string;
	/** Which argument, if any, names the thing. */
	readonly idKey?: string;
}

/**
 * The tools that act on something a person owns, and what they leave behind. Reads are here
 * too: knowing which note the agent read is how a user judges the answer it gave.
 *
 * A tool absent from this map contributes nothing to the summary — searches and list calls
 * have no single subject, and inventing one for them would be a row that opens nothing.
 */
const subjects: Readonly<Record<string, ToolSubject>> = {
	get_note: { kind: 'note', verb: 'read', idKey: 'noteId' },
	save_note: { kind: 'note', verb: 'edited', idKey: 'noteId' },
	edit_note: { kind: 'note', verb: 'edited', idKey: 'noteId' },
	create_note: { kind: 'note', verb: 'created' },
	rename_note: { kind: 'note', verb: 'renamed', idKey: 'noteId' },
	publish_note: { kind: 'note', verb: 'published', idKey: 'noteId' },
	discard_note_draft: { kind: 'note', verb: 'draft discarded', idKey: 'noteId' },
	archive_note: { kind: 'note', verb: 'moved to trash', idKey: 'noteId' },
	restore_note: { kind: 'note', verb: 'restored', idKey: 'noteId' },
	restore_note_version: { kind: 'note', verb: 'restored a version', idKey: 'noteId' },
	list_note_versions: { kind: 'note', verb: 'read history', idKey: 'noteId' },
	delete_note_forever: { kind: 'note', verb: 'deleted', idKey: 'noteId' },
	create_todo: { kind: 'todo', verb: 'created' },
	update_todo: { kind: 'todo', verb: 'updated', idKey: 'todoId' },
	create_project: { kind: 'project', verb: 'created' },
	rename_project: { kind: 'project', verb: 'renamed', idKey: 'projectId' },
	archive_project: { kind: 'project', verb: 'archived', idKey: 'projectId' },
	get_project: { kind: 'project', verb: 'read', idKey: 'projectId' },
	create_skill: { kind: 'skill', verb: 'created' },
	save_skill: { kind: 'skill', verb: 'edited', idKey: 'noteId' },
	edit_skill: { kind: 'skill', verb: 'edited', idKey: 'noteId' },
	update_skill: { kind: 'skill', verb: 'updated', idKey: 'noteId' }
};

/**
 * Which verb survives when one thing was worked on several times. A note read three times
 * and then edited was edited; saying "read" of it would be true of the calls and false of
 * the turn.
 */
const verbRank = [
	'read history',
	'read',
	'restored a version',
	'restored',
	'renamed',
	'draft discarded',
	'updated',
	'published',
	'edited',
	'moved to trash',
	'deleted',
	'created'
];

const strongerVerb = (left: string, right: string): string =>
	verbRank.indexOf(right) > verbRank.indexOf(left) ? right : left;

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A create names its result only on the way back: the id it can be opened by exists in the
 * output and nowhere else. Without this, everything the agent makes for you is unreachable
 * from the moment it tells you it made it.
 */
const identify = (tool: ChatToolActivity, subject: ToolSubject): string | undefined => {
	const fromArguments = subject.idKey ? asString(tool.arguments[subject.idKey]) : undefined;
	if (fromArguments) return fromArguments;
	if (!isRecord(tool.output)) return undefined;
	return asString(tool.output.noteId) ?? asString(tool.output.todoId) ?? asString(tool.output.id);
};

const nameOf = (
	tool: ChatToolActivity,
	subject: ToolSubject,
	id: string | undefined,
	shell?: ShellContext
): string | undefined => {
	if (subject.kind === 'note' || subject.kind === 'skill') {
		const resolved = noteTitle(shell, id);
		if (resolved) return resolved;
	}
	if (subject.kind === 'project' && id) {
		const project = shell?.projects.find((candidate) => candidate.id === id);
		if (project) return project.name;
	}
	return (
		asString(tool.arguments.title) ??
		asString(tool.arguments.name) ??
		(isRecord(tool.output)
			? (asString(tool.output.title) ?? asString(tool.output.name))
			: undefined)
	);
};

/** What to call a thing whose name we could not resolve. It still opens; it just has no title. */
const placeholder: Readonly<Record<TouchedKind, string>> = {
	note: 'A note',
	todo: 'A todo',
	project: 'A project',
	skill: 'A skill'
};

/**
 * One entry per call that acted on something, in call order and undeduplicated — what the
 * turn shows while it is still running, where the point is watching it work.
 */
export function turnSteps(
	tools: readonly ChatToolActivity[],
	shell?: ShellContext
): readonly TouchedThing[] {
	const steps: TouchedThing[] = [];
	for (const tool of tools) {
		if (mechanismTools.has(tool.name)) continue;
		// A call parked on approval is already on screen in full, as the change the reader is
		// being asked to decide on. Listing it again underneath says the same thing twice.
		if (tool.status === 'approval_required') continue;
		const subject = subjects[tool.name];
		if (!subject) continue;
		const id = identify(tool, subject);
		const name = nameOf(tool, subject, id, shell);
		steps.push({
			kind: subject.kind,
			...(id ? { id } : {}),
			title: name ?? placeholder[subject.kind],
			named: name !== undefined,
			verb: subject.verb,
			pending: tool.status === 'running',
			failed: tool.status === 'failed' || tool.status === 'rejected'
		});
	}
	return steps;
}

/**
 * Identity for deduplication. Things with an id fold onto that id; things without one fold
 * onto their name, so two calls creating the same todo do not read as two todos.
 */
const identityOf = (thing: TouchedThing): string => `${thing.kind}:${thing.id ?? thing.title}`;

export function turnActivity(
	tools: readonly ChatToolActivity[],
	shell?: ShellContext
): TurnActivity {
	const order: string[] = [];
	const byIdentity = new Map<string, TouchedThing>();

	for (const step of turnSteps(tools, shell)) {
		const key = identityOf(step);
		const existing = byIdentity.get(key);
		if (!existing) {
			order.push(key);
			byIdentity.set(key, step);
			continue;
		}
		byIdentity.set(key, {
			...existing,
			...(step.id ? { id: step.id } : {}),
			// A later call that resolved a name wins over a placeholder.
			title: step.named ? step.title : existing.title,
			named: existing.named || step.named,
			verb: strongerVerb(existing.verb, step.verb),
			pending: step.pending,
			// A failure that a later call on the same thing made good is a retry, not news.
			failed: step.failed
		});
	}

	const touched = order.map((key) => byIdentity.get(key) as TouchedThing);
	const recovered = new Set(
		touched.filter((thing) => !thing.failed).map((thing) => identityOf(thing))
	);

	// A failure earns a sentence only when nothing later put it right. The wrapper rejection
	// that precedes a successful save is the agent correcting itself mid-turn.
	const failures = tools
		.filter((tool): tool is ChatToolActivity & { failure: string } => {
			if (!tool.failure || mechanismTools.has(tool.name)) return false;
			const subject = subjects[tool.name];
			if (!subject) return true;
			const id = identify(tool, subject);
			const key = identityOf({
				kind: subject.kind,
				...(id ? { id } : {}),
				title: nameOf(tool, subject, id, shell) ?? placeholder[subject.kind],
				named: false,
				verb: subject.verb,
				pending: false,
				failed: true
			});
			return !recovered.has(key);
		})
		// One sentence per distinct failure: a call retried verbatim twice failed once as far
		// as the reader is concerned.
		.filter(
			(tool, index, all) => all.findIndex((other) => other.failure === tool.failure) === index
		);

	return { touched, failures, callCount: tools.length };
}
