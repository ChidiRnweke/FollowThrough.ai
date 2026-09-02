import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { ToolActivityOverrides } from '$lib/testing/agent/tool-activity';
// `TOOL_DESCRIPTIONS`, not `TOOL_CATALOG`: the latter drops the first-class tools, which
// are exactly the ones the agent reaches for most and so the ones that most need a row.
import { TOOL_DESCRIPTIONS, type AgentToolName } from '$lib/models/agent/tool-catalog';
import {
	mechanismTools,
	quietTools,
	turnActivity,
	turnSteps,
	type TouchedThing,
	type TurnRow
} from './turn-activity';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
const OTHER_NOTE_ID = '2c9b0b53-9c2f-4c1a-9f0b-6b7c9b1f2a34';

const shell = {
	projects: [],
	noteTree: [
		{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary,
		{ id: OTHER_NOTE_ID, title: 'Runtime notes' } as unknown as NoteSummary
	]
} as unknown as ShellContext;

let nextCall = 0;
const call = (over: ToolActivityOverrides): ChatToolActivity => ({
	callId: `call-${++nextCall}`,
	name: 'get_note',
	arguments: { noteId: NOTE_ID },
	status: 'succeeded',
	...over
});

/**
 * The row as a touched thing, for the assertions that are about one.
 *
 * A row is a thing that was touched *or* work that was done, and only the first
 * has a title, an id and a verb. Narrowing here rather than asserting at each
 * `expect` keeps the union honest and makes a row that turns out to be an action
 * fail loudly instead of reading `undefined`.
 */
const thing = (row: TurnRow | undefined): TouchedThing => {
	if (!row || row.kind === 'action') throw new Error(`Expected a touched thing, got ${row?.kind}`);
	return row;
};

describe('A turn reports things, not calls', () => {
	it('folds repeated work on one note into a single entry', () => {
		const activity = turnActivity([call({}), call({}), call({ name: 'save_note' })], shell);
		expect(activity.touched).toHaveLength(1);
	});

	it('reports the strongest thing that happened to it', () => {
		const activity = turnActivity([call({}), call({ name: 'save_note' }), call({})], shell);
		expect(thing(activity.touched[0]).verb).toBe('edited');
	});

	it('names the note so the reader recognises it', () => {
		expect(thing(turnActivity([call({})], shell).touched[0]).title).toBe('Infrastructure');
	});

	it('keeps two different notes apart', () => {
		const activity = turnActivity(
			[call({}), call({ arguments: { noteId: OTHER_NOTE_ID } })],
			shell
		);
		expect(activity.touched).toHaveLength(2);
	});

	it('offers the id so the entry can be opened', () => {
		expect(thing(turnActivity([call({})], shell).touched[0]).id).toBe(NOTE_ID);
	});
});

describe('Mechanism the agent needs is not work the user did', () => {
	it('leaves a tool search out of the summary', () => {
		const activity = turnActivity(
			[call({ name: 'search_tools', arguments: { query: 'save_note' } })],
			shell
		);
		expect(activity.touched).toEqual([]);
	});

	it('leaves a search out of the summary, having no single subject', () => {
		const activity = turnActivity([call({ name: 'search', arguments: { query: 'bugs' } })], shell);
		expect(activity.touched).toEqual([]);
	});

	it('still counts every call, so the details door knows it has something to open', () => {
		const activity = turnActivity([call({ name: 'search_tools', arguments: {} }), call({})], shell);
		expect(activity.callCount).toBe(2);
	});
});

describe('A failure is news only when nothing put it right', () => {
	it('says nothing about a failed call the agent then retried successfully', () => {
		const activity = turnActivity(
			[
				call({ name: 'save_note', status: 'failed', failure: 'Not callable directly.' }),
				call({ name: 'save_note' })
			],
			shell
		);
		expect(activity.failures).toEqual([]);
	});

	it('says nothing about a failure the agent put right after speaking in between', () => {
		const failed = call({ name: 'save_note', status: 'failed', failure: 'Not callable.' });
		const succeeded = call({ name: 'save_note' });
		// The two attempts land in different groups because the agent spoke between them; the
		// question of whether it was put right belongs to the turn.
		expect(turnActivity([failed], shell, [failed, succeeded]).failures).toEqual([]);
	});

	it('says nothing about a malformed attempt the agent then got right', () => {
		// A rejected payload names no note, so only the tool it was trying to be identifies it.
		const malformed = {
			...call({ name: 'save_note', status: 'failed', failure: 'Invalid payload.' }),
			arguments: {}
		};
		const succeeded = call({ name: 'save_note' });
		expect(turnActivity([malformed], shell, [malformed, succeeded]).failures).toEqual([]);
	});

	it('reports a failure that stood', () => {
		const activity = turnActivity(
			[call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })],
			shell
		);
		expect(activity.failures.map((group) => group.raw)).toEqual(['The note was locked.']);
	});

	it('marks the entry itself as failed so the row can say so', () => {
		const activity = turnActivity(
			[call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })],
			shell
		);
		expect(activity.touched[0]?.outcome).toBe('failed');
	});
});

describe('Something the agent just made is still openable', () => {
	it('takes a created note id from what the call returned', () => {
		const activity = turnActivity(
			[
				call({
					name: 'create_note',
					arguments: { title: 'Reviewed draft' },
					output: { noteId: OTHER_NOTE_ID }
				})
			],
			shell
		);
		expect(thing(activity.touched[0]).id).toBe(OTHER_NOTE_ID);
	});

	it('names it from the arguments when the tree has not caught up', () => {
		const activity = turnActivity(
			[call({ name: 'create_note', arguments: { title: 'Reviewed draft' } })],
			shell
		);
		expect(thing(activity.touched[0]).title).toBe('Reviewed draft');
	});

	it('falls back to a plain label rather than an id nobody can read', () => {
		const activity = turnActivity([call({ arguments: { noteId: 'unknown-note' } })], shell);
		expect(thing(activity.touched[0]).title).toBe('A note');
	});
});

describe('A running turn shows its steps as they arrive', () => {
	it('keeps each call while the turn is still working', () => {
		expect(turnSteps([call({}), call({}), call({ name: 'save_note' })], shell)).toHaveLength(3);
	});

	it('marks the call in flight as running', () => {
		expect(turnSteps([call({ status: 'running' })], shell)[0]?.outcome).toBe('running');
	});

	// It shares no value with a genuine failure any more, which is what used to drop it
	// from the rows and from the failure sentences alike.
	it('keeps a refused call as its own outcome rather than a failure', () => {
		expect(turnSteps([call({ name: 'save_note', status: 'rejected' })], shell)[0]?.outcome).toBe(
			'rejected'
		);
	});

	it('leaves a change awaiting approval to the approval, which shows it in full', () => {
		expect(turnSteps([call({ name: 'save_note', status: 'approval_required' })], shell)).toEqual(
			[]
		);
	});
});

/**
 * The guarantee this file exists to keep, and the one it did not keep before.
 *
 * A row appeared only for the 22 names in `subjects`; the catalogue's other 46
 * tools ran and reported nothing. `create_diagram` was one of them, so a studio
 * turn that drew a diagram summarised itself as having done nothing at all.
 *
 * The default is visible now, and this is what holds it that way — the same idea
 * as `AgentToolCoverage` keeping the server total over its controller methods.
 */
describe('Every tool the agent can call reports itself', () => {
	const rowFor = (name: AgentToolName) => turnSteps([call({ name })], shell)[0];
	// Both lists hide a call on purpose; the test is that hiding is always on purpose.
	const quietNames = new Set([...quietTools, ...mechanismTools]);

	it.each(TOOL_DESCRIPTIONS.map((entry) => entry.name))(
		'%s produces a row or is deliberately quiet',
		(name) => {
			expect(rowFor(name) !== undefined || quietNames.has(name)).toBe(true);
		}
	);

	// A name in the quiet list that no longer exists is a rule guarding nothing, and it
	// hides whichever tool inherits that name next. `search_tools` and `use_tool` are the
	// discovery mechanism rather than entries in what it discovers, so they are the two
	// names legitimately absent from the catalogue.
	it('keeps no quiet entry for a tool the catalogue has dropped', () => {
		const known = new Set([
			...TOOL_DESCRIPTIONS.map((entry) => entry.name),
			'search_tools',
			'use_tool'
		]);
		expect([...quietNames].filter((name) => !known.has(name))).toEqual([]);
	});
});

/**
 * The half of a failure block that made it three blocks.
 *
 * A cause and its subjects, rather than one entry per failed call. Judged group by
 * group — which is how `chat-thread.svelte` hands them over — a run abandoned holding
 * three approvals reported its one cause three times, once per group, with nothing to
 * tell the three red sentences apart and nothing in any of them to click.
 */
describe('A turn states each cause once, and names everything it befell', () => {
	const abandoned = (noteId: string) =>
		call({
			name: 'save_note',
			arguments: { noteId },
			status: 'failed',
			failure: 'The run ended before you answered.'
		});

	it('folds calls that failed for one reason into one block', () => {
		const tools = [abandoned(NOTE_ID), abandoned(OTHER_NOTE_ID)];
		expect(turnActivity(tools, shell, tools).failures).toHaveLength(1);
	});

	it('keeps every subject of that one cause', () => {
		const tools = [abandoned(NOTE_ID), abandoned(OTHER_NOTE_ID)];
		expect(turnActivity(tools, shell, tools).failures[0]?.subjects).toHaveLength(2);
	});

	it('reports a failure the caller only handed it one group of', () => {
		const tools = [abandoned(NOTE_ID), abandoned(OTHER_NOTE_ID)];
		// The group is the second call alone; the turn is both. Both subjects still appear,
		// so the block does not have to be repeated on the group that carries the other one.
		expect(turnActivity([tools[1]!], shell, tools).failures[0]?.subjects).toHaveLength(2);
	});

	it('separates two different causes into two blocks', () => {
		const tools = [
			abandoned(NOTE_ID),
			call({
				name: 'save_note',
				arguments: { noteId: OTHER_NOTE_ID },
				status: 'failed',
				failure: 'The note was locked.'
			})
		];
		expect(turnActivity(tools, shell, tools).failures).toHaveLength(2);
	});

	it('gives a failed subject the id that opens it', () => {
		const tools = [abandoned(NOTE_ID)];
		const [subject] = turnActivity(tools, shell, tools).failures[0]!.subjects;
		expect(subject?.kind === 'action' ? undefined : subject?.id).toBe(NOTE_ID);
	});
});

/**
 * `edit_note` returns `{ failure, problems }` as a value rather than throwing, on
 * purpose: a throw is stringified to a bare message and strips the counts the model
 * needs to correct itself (ADR 0035). The run used to journal it `succeeded` all the
 * same, so nothing downstream saw it — the row read "Edited note" in ordinary colour
 * and the summary claimed the verb `edited`. ADR 0015: a user must be able to tell.
 * The run classifies it now, and the row arrives on the arm that says so.
 */
describe('A failure a tool returned as a value is still a failure', () => {
	const noOpEdit = call({
		name: 'edit_note',
		arguments: { noteId: NOTE_ID },
		status: 'reported_failure',
		failure: 'No edits were applied.',
		output: { failure: 'No edits were applied.', problems: ['Edit 1: oldText was not found.'] }
	});

	it('does not claim the note was edited', () => {
		expect(thing(turnSteps([noOpEdit], shell)[0]).outcome).toBe('failed');
	});

	it('reports it among the turn failures', () => {
		expect(turnActivity([noOpEdit], shell, [noOpEdit]).failures).toHaveLength(1);
	});

	it('does not let it stand in as the retry that put itself right', () => {
		const stillFailed = turnActivity([noOpEdit], shell, [noOpEdit]).failures;
		expect(stillFailed[0]?.raw).toBe('No edits were applied.');
	});
});

/**
 * Every diagram tool was typed as a note and absent from `subjects`, so the studio's
 * one output rendered as a row with nothing behind it — and had `promote_diagram`'s id
 * ever resolved, it would have opened a note tab for an id that is not a note.
 */
describe('A diagram the agent made is a diagram, and it opens', () => {
	const DIAGRAM_ID = '7a1f4d02-6b3e-4f88-9a21-0c5d8e2b7f10';

	it('reports a created diagram as a diagram', () => {
		const made = call({
			name: 'create_diagram',
			arguments: { title: 'Web Application Architecture' },
			output: { diagramId: DIAGRAM_ID }
		});
		expect(thing(turnSteps([made], shell)[0]).kind).toBe('diagram');
	});

	it('takes the id it can be opened by from what the call returned', () => {
		const made = call({
			name: 'create_diagram',
			arguments: { title: 'Web Application Architecture' },
			output: { diagramId: DIAGRAM_ID }
		});
		expect(thing(turnSteps([made], shell)[0]).id).toBe(DIAGRAM_ID);
	});

	it('names it rather than describing the call', () => {
		const revised = call({
			name: 'edit_diagram',
			arguments: { diagramId: DIAGRAM_ID, title: 'Web Application Architecture (Azure)' }
		});
		expect(thing(turnSteps([revised], shell)[0]).title).toBe(
			'Web Application Architecture (Azure)'
		);
	});
});
