import type { ShellContext } from '$lib/models/workspace';
import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { noteTitle } from '../../chat/actions/tool-approval-fields';
import { toolStatusParts } from './tool-presentation';
import { explainToolFailure } from './tool-result';
import { mechanismTools, quietTools, type RenderedTool } from './rendered-tools';
import { toolResultFields } from './tool-result-fields';
import type { AgentPayload } from '$lib/models/agent/payload';

export { mechanismTools, quietTools };

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

export type TouchedKind = 'note' | 'todo' | 'project' | 'skill' | 'diagram';

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

const stepOutcome = (tool: ChatToolActivity): StepOutcome => {
	if (tool.status === 'running') return 'running';
	if (tool.status === 'rejected') return 'rejected';
	// `toolFailure` and not `status === 'failed'`: a call can carry its failure in its
	// result, which is how a no-op `edit_note` came to be summarised as `edited`.
	if (toolFailure(tool) !== undefined) return 'failed';
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
 * nothing it had done, because `create_diagram` is not in the map.
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

/**
 * One thing that went wrong, and everything it went wrong to.
 *
 * A cause and its subjects, rather than a list of failed calls, because that is
 * what a reader is looking at: three calls abandoned by the same stopped run are
 * one piece of news about three things, not three pieces of news. Returned as
 * one shape so the block can state the cause once — it used to be printed per
 * call, and then again inside each call's row in the log, so a turn that lost
 * three changes said the same sentence six times.
 *
 * `subjects` are {@link TurnRow}s and not strings so each one opens, on exactly
 * the same terms as a row that succeeded. A failure is the moment a link is
 * worth most: the note is still there, and the reader is about to go and look.
 */
export interface FailureGroup {
	/** The reason, in the reader's terms, stated once. */
	readonly cause: string;
	/** What it befell. Never empty. */
	readonly subjects: readonly TurnRow[];
	/** The raw message, for the log. Evidence, not the message. */
	readonly raw: string;
}

export interface TurnActivity {
	/** What the turn did, deduplicated and in the order it happened. */
	readonly touched: readonly TurnRow[];
	/** What failed and nothing later put right, grouped by cause. */
	readonly failures: readonly FailureGroup[];
	/** Every call the turn made, mechanism included — what the details door is for. */
	readonly callCount: number;
}

interface ToolSubject {
	readonly kind: TouchedKind;
	readonly verb: string;
	/** Which argument, if any, names the thing. */
	readonly idKey?: string;
}

/**
 * A tool that renders but names nothing the reader can open. Spelled out rather
 * than left absent for the same reason `audit-allow` carries a reason: the map
 * below is total over {@link RenderedTool}, so adding a tool forces the question
 * "what does this act on?", and answering "nothing" is an entry a reviewer can
 * see rather than a gap nobody notices.
 */
const NO_SUBJECT = 'no-subject';

/**
 * The tools that act on something a person owns, and what they leave behind. Reads are here
 * too: knowing which note the agent read is how a user judges the answer it gave.
 *
 * Total over the tools that render. It used to hold 22 names and be consulted with a plain
 * lookup, so the other 22 rendered tools fell through to a row with nothing behind it —
 * every diagram tool among them, which is the one output the studio exists to produce.
 */
const subjects: Record<RenderedTool, ToolSubject | typeof NO_SUBJECT> = {
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
	// One row per todo would be the batch's whole point undone; the disclosure lists them.
	create_todos: NO_SUBJECT,
	update_todo: { kind: 'todo', verb: 'updated', idKey: 'todoId' },
	create_project: { kind: 'project', verb: 'created' },
	rename_project: { kind: 'project', verb: 'renamed', idKey: 'projectId' },
	archive_project: { kind: 'project', verb: 'archived', idKey: 'projectId' },
	get_project: { kind: 'project', verb: 'read', idKey: 'projectId' },
	create_skill: { kind: 'skill', verb: 'created' },
	create_skill_from_selection: { kind: 'skill', verb: 'created' },
	save_skill: { kind: 'skill', verb: 'edited', idKey: 'noteId' },
	edit_skill: { kind: 'skill', verb: 'edited', idKey: 'noteId' },
	update_skill: { kind: 'skill', verb: 'updated', idKey: 'noteId' },
	restore_skill_version: { kind: 'skill', verb: 'restored a version', idKey: 'noteId' },
	set_skill_pinned: { kind: 'skill', verb: 'updated', idKey: 'noteId' },
	// A diagram is a thing the user owns and can open, and it was none of those:
	// every diagram tool was typed as a note, had no entry here, and so rendered
	// as a row with nothing behind it — for the one output the studio exists to
	// produce.
	create_diagram: { kind: 'diagram', verb: 'created' },
	edit_diagram: { kind: 'diagram', verb: 'edited', idKey: 'diagramId' },
	revise_mermaid_diagram: { kind: 'diagram', verb: 'revised', idKey: 'diagramId' },
	promote_diagram: { kind: 'diagram', verb: 'kept', idKey: 'diagramId' },
	create_folder: { kind: 'note', verb: 'created' },
	move_project_entry: { kind: 'note', verb: 'moved', idKey: 'noteId' },
	empty_note_trash: NO_SUBJECT,
	// The suggestion is the subject, and a suggestion has no surface of its own to
	// open — it is decided in the panel it came from.
	accept_suggestion: NO_SUBJECT,
	reject_suggestion: NO_SUBJECT,
	revert_suggestion: NO_SUBJECT,
	extract_promises: NO_SUBJECT,
	relate_selection: NO_SUBJECT,
	propose_memory_change: NO_SUBJECT,
	export_document: NO_SUBJECT,
	update_export_settings: NO_SUBJECT,
	download_artifact: NO_SUBJECT,
	delete_artifact: NO_SUBJECT,
	regenerate_artifact: NO_SUBJECT
};

const subjectOfTool = (name: string): ToolSubject | undefined => {
	const entry = (subjects as Record<string, ToolSubject | typeof NO_SUBJECT>)[name];
	return entry === undefined || entry === NO_SUBJECT ? undefined : entry;
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
	'moved',
	'draft discarded',
	'updated',
	'published',
	'kept',
	'revised',
	'edited',
	'moved to trash',
	'deleted',
	'created'
];

const strongerVerb = (left: string, right: string): string =>
	verbRank.indexOf(right) > verbRank.indexOf(left) ? right : left;

const asString = (value: AgentPayload | undefined): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

/**
 * A create names its result only on the way back: the id it can be opened by exists in the
 * output and nowhere else. Without this, everything the agent makes for you is unreachable
 * from the moment it tells you it made it.
 */
const identify = (tool: ChatToolActivity, subject: ToolSubject): string | undefined => {
	const fromArguments = subject.idKey ? asString(tool.arguments[subject.idKey]) : undefined;
	if (fromArguments) return fromArguments;
	const returned = toolResultFields(toolOutput(tool));
	return (
		returned.noteId ??
		returned.todoId ??
		returned.diagramId ??
		// Deliberately not `projectId`: it is present on results whose subject is a note or a
		// diagram, and taking it there would hand the row an id of the wrong kind — which
		// opens the wrong thing rather than failing to open.
		returned.id
	);
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
	const returned = toolResultFields(toolOutput(tool));
	return (
		asString(tool.arguments.title) ??
		asString(tool.arguments.name) ??
		returned.title ??
		returned.name
	);
};

/** What to call a thing whose name we could not resolve. It still opens; it just has no title. */
const placeholder: Readonly<Record<TouchedKind, string>> = {
	note: 'A note',
	todo: 'A todo',
	project: 'A project',
	skill: 'A skill',
	diagram: 'A diagram'
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
		const subject = subjectOfTool(tool.name);
		// Not a note, todo, project or skill — but still work, and it says so in its own
		// words rather than not appearing. `toolStatusParts` is total over the catalogue,
		// falling back to a readable form of the tool's name, so there is always a phrase.
		if (!subject) {
			steps.push({
				kind: 'action',
				label: toolStatusParts(tool, shell).label,
				outcome: stepOutcome(tool)
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
			outcome: stepOutcome(tool)
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
		(tool) =>
			tool.status === 'succeeded' &&
			// A call that came back carrying a failure did not succeed, whatever the run
			// journalled. Counting it here made it "recover" the very failure it is.
			toolFailure(tool) === undefined &&
			!mechanismTools.has(tool.name)
	);
	const recovered = new Set(turnSteps(succeeded, shell).map((step) => identityOf(step)));
	// A call whose payload was malformed never names its subject, so identity cannot match it
	// against the retry that worked. The tool it was trying to be is the only handle left, and
	// a turn that later saved the note did not fail to save the note.
	const recoveredNames = new Set(succeeded.map((tool) => tool.name));

	// A failure earns a sentence only when nothing later put it right. The wrapper rejection
	// that precedes a successful save is the agent correcting itself mid-turn.
	//
	// Judged over `turnTools`, not `tools`. Whether something failed is a question about the
	// turn, and the caller hands this one group of it at a time: three groups each holding one
	// abandoned call each reported their own failure, so the reader got the same red sentence
	// three times down the transcript with nothing distinguishing them.
	const unresolved = turnTools
		.filter((tool) => toolFailure(tool) !== undefined)
		.filter((tool) => {
			if (mechanismTools.has(tool.name)) return false;
			const subject = subjectOfTool(tool.name);
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
		});

	// One block per cause, carrying every thing that cause befell. Grouped on the reader's
	// sentence rather than the raw message so two phrasings of "the note moved on" are one
	// piece of news, which is how the reader experiences them.
	const byCause = new Map<string, { raw: string; subjects: TurnRow[] }>();
	for (const tool of unresolved) {
		const raw = toolFailure(tool) as string;
		const cause = explainToolFailure(raw) ?? raw;
		const group = byCause.get(cause) ?? { raw, subjects: [] };
		const [row] = turnSteps([tool], shell);
		// A subject the group already names is the same call retried verbatim: one row.
		if (row && !group.subjects.some((existing) => identityOf(existing) === identityOf(row)))
			group.subjects.push(row);
		byCause.set(cause, group);
	}

	const failures = [...byCause.entries()]
		.filter(([, group]) => group.subjects.length > 0)
		.map(([cause, group]) => ({ cause, raw: group.raw, subjects: group.subjects }));

	return { touched, failures, callCount: tools.length };
}
