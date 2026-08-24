import type { ShellContext } from '$lib/models/workspace';
import {
	toolOutput,
	type ChatToolActivity,
	type FailedToolActivity
} from '$lib/stores/agent/chat-tools';
import { noteTitle } from '../../chat/actions/tool-approval-fields';
import { toolStatusParts } from './tool-presentation';

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

/**
 * What became of the call a row stands for.
 *
 * One field, because it is one fact. As `pending` and `failed` side by side it
 * was two booleans over four states: `{ pending: true, failed: true }` was
 * sayable and meaningless, and — the reason this matters — `rejected` had no
 * value of its own. It shared `failed: true` with a genuine failure, so the row
 * filter dropped it as "the failure sentence will restate this", and the failure
 * list never collected it because that only takes `status === 'failed'`. A call
 * the user refused disappeared from the transcript entirely.
 */
export type StepOutcome = 'running' | 'done' | 'failed' | 'rejected';

const stepOutcome = (status: ChatToolActivity['status']): StepOutcome => {
	if (status === 'running') return 'running';
	if (status === 'failed') return 'failed';
	if (status === 'rejected') return 'rejected';
	return 'done';
};

export interface TouchedThing {
	readonly kind: TouchedKind;
	/** Set only when the thing can actually be opened. */
	readonly id?: string;
	readonly title: string;
	/** False when `title` is a placeholder, so a caller can try to resolve the real one. */
	readonly named: boolean;
	/** What became of it: `edited`, `read`, `created`, … */
	readonly verb: string;
	readonly outcome: StepOutcome;
}

/**
 * Work the turn did that is not one of the user's own things.
 *
 * `subjects` maps the tools whose subject is a note, todo, project or skill —
 * 22 of the catalogue's 79. Everything else used to be `continue`d past and
 * vanish: every diagram tool, every memory, artifact, suggestion and reference
 * tool, `search`, `create_todos`. A studio turn that drew a diagram reported
 * nothing it had done, because `present_diagram` is not in the map.
 *
 * A separate arm rather than optional fields on {@link TouchedThing}: an action
 * has no id, no resolvable name and no verb of its own — `label` is the whole
 * phrase, already in the user's language. Bolting `verb?` and `id?` onto the
 * other shape would make an unopenable thing indistinguishable from a note
 * whose title had not resolved yet.
 */
export interface TurnAction {
	readonly kind: 'action';
	/** The whole phrase, from `toolStatusParts` — verb included. */
	readonly label: string;
	readonly outcome: StepOutcome;
}

/** One row of a turn's summary: a thing that was touched, or work that was done. */
export type TurnRow = TouchedThing | TurnAction;

export interface TurnActivity {
	/** What the turn did, deduplicated and in the order it happened. */
	readonly touched: readonly TurnRow[];
	/**
	 * Calls that failed and that nothing later made good. The whole activity is returned
	 * rather than its message, so the failure can be stated as what happened to which thing
	 * instead of as the sentence the run happened to produce.
	 */
	readonly failures: readonly FailedToolActivity[];
	/** Every call the turn made, mechanism included — what the details door is for. */
	readonly callCount: number;
}

/**
 * Calls that are the agent finding its footing rather than work on the workspace. A row
 * reading "Search tools" is not reassurance, and it is not something anyone can act on.
 */
export const mechanismTools = new Set([
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

/**
 * Reads and searches that tell the reader nothing they can act on.
 *
 * The rule dividing this from an action row is whether the call *changed*
 * anything. A search that found nine notes is the agent orienting itself, the
 * same as a tool search; the answer it produced is the thing worth reading.
 *
 * Stated as an explicit list because the default is now the other way round.
 * Rows used to appear only for the 22 names in `subjects`, so all 46 of the
 * catalogue's other tools were dropped in silence — including every diagram
 * tool, which is why a studio turn that drew a diagram reported nothing it had
 * done. Anything unlisted now gets a row, so a tool added tomorrow is visible
 * by default and hiding one is a decision somebody has to write down here.
 */
export const quietTools = new Set([
	'search',
	'search_note',
	'search_icons',
	'find_references',
	'get_today_view',
	'get_artifact',
	'get_export_settings',
	'diff_note_versions',
	'read_attachment',
	'read_note_version',
	'read_canvas_diagram',
	'read_project_diagram',
	'list_projects',
	'list_todos',
	'list_skills',
	'list_skill_versions',
	'list_artifacts',
	'list_attachments',
	'list_templates',
	'list_suggestions',
	'list_trashed_notes',
	'list_user_memory',
	'list_project_memory'
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
	const output = toolOutput(tool);
	if (!isRecord(output)) return undefined;
	return asString(output.noteId) ?? asString(output.todoId) ?? asString(output.id);
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
	const output = toolOutput(tool);
	return (
		asString(tool.arguments.title) ??
		asString(tool.arguments.name) ??
		(isRecord(output) ? (asString(output.title) ?? asString(output.name)) : undefined)
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
): readonly TurnRow[] {
	const steps: TurnRow[] = [];
	for (const tool of tools) {
		if (mechanismTools.has(tool.name) || quietTools.has(tool.name)) continue;
		// A call parked on approval is already on screen in full, as the change the reader is
		// being asked to decide on. Listing it again underneath says the same thing twice.
		if (tool.status === 'approval_required') continue;
		const subject = subjects[tool.name];
		// Not a note, todo, project or skill — but still work, and it says so in its own
		// words rather than not appearing. `toolStatusParts` is total over the catalogue,
		// falling back to a readable form of the tool's name, so there is always a phrase.
		if (!subject) {
			steps.push({
				kind: 'action',
				label: toolStatusParts(tool, shell).label,
				outcome: stepOutcome(tool.status)
			});
			continue;
		}
		const id = identify(tool, subject);
		const name = nameOf(tool, subject, id, shell);
		steps.push({
			kind: subject.kind,
			...(id ? { id } : {}),
			title: name ?? placeholder[subject.kind],
			named: name !== undefined,
			verb: subject.verb,
			outcome: stepOutcome(tool.status)
		});
	}
	return steps;
}

/**
 * Identity for deduplication. Things with an id fold onto that id; things without one fold
 * onto their name, so two calls creating the same todo do not read as two todos.
 */
const identityOf = (row: TurnRow): string =>
	row.kind === 'action' ? `action:${row.label}` : `${row.kind}:${row.id ?? row.title}`;

export function turnActivity(
	tools: readonly ChatToolActivity[],
	shell?: ShellContext,
	/**
	 * Every call of the turn, when `tools` is only a slice of it. Whether a failure was put
	 * right is a question about the turn, not about the run of calls it happened in: the
	 * agent typically says something between the attempt that failed and the one that
	 * worked, which splits them into different groups. Judged group by group, a save that
	 * eventually succeeded still reported two failures.
	 */
	turnTools: readonly ChatToolActivity[] = tools
): TurnActivity {
	const order: string[] = [];
	const byIdentity = new Map<string, TurnRow>();

	for (const step of turnSteps(tools, shell)) {
		const key = identityOf(step);
		const existing = byIdentity.get(key);
		if (!existing) {
			order.push(key);
			byIdentity.set(key, step);
			continue;
		}
		// Two actions with the same phrase are one row, and the last one is what it says.
		// There is nothing else to fold: an action has no name to resolve and no verb to
		// strengthen.
		if (existing.kind === 'action' || step.kind === 'action') {
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
			// A failure that a later call on the same thing made good is a retry, not news,
			// so the last call on a thing is what its row reports.
			outcome: step.outcome
		});
	}

	const touched = order.map((key) => byIdentity.get(key) as TouchedThing);
	const succeeded = turnTools.filter(
		(tool) => tool.status === 'succeeded' && !mechanismTools.has(tool.name)
	);
	const recovered = new Set(turnSteps(succeeded, shell).map((step) => identityOf(step)));
	// A call whose payload was malformed never names its subject, so identity cannot match it
	// against the retry that worked. The tool it was trying to be is the only handle left, and
	// a turn that later saved the note did not fail to save the note.
	const recoveredNames = new Set(succeeded.map((tool) => tool.name));

	// A failure earns a sentence only when nothing later put it right. The wrapper rejection
	// that precedes a successful save is the agent correcting itself mid-turn.
	const failures = tools
		.filter((tool) => tool.status === 'failed')
		.filter((tool) => {
			if (mechanismTools.has(tool.name)) return false;
			const subject = subjects[tool.name];
			if (!subject) return true;
			const id = identify(tool, subject);
			if (!id) return !recoveredNames.has(tool.name);
			const key = identityOf({
				kind: subject.kind,
				id,
				title: nameOf(tool, subject, id, shell) ?? placeholder[subject.kind],
				named: false,
				verb: subject.verb,
				outcome: 'failed'
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
