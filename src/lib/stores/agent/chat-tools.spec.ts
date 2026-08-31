import { describe, expect, it } from 'vitest';
import type { AgentPayload } from '$lib/models/agent/payload';
import {
	matchToolActivity,
	mergeToolActivity,
	readJournalledTool,
	toolArguments,
	toolFailure,
	toolOutput,
	type ChatToolActivity
} from './chat-tools';

const runningTool = (callId = 'call-1'): ChatToolActivity => ({
	callId,
	name: 'find_references',
	arguments: { query: 'agent skills' },
	status: 'running'
});

const completed = (callId: string, output: AgentPayload): ChatToolActivity => ({
	callId,
	name: 'find_references',
	arguments: {},
	output,
	status: 'succeeded'
});

describe('Matching a tool event to the row it settles', () => {
	it('finds the row the call already occupies', () => {
		expect(matchToolActivity([runningTool()], completed('call-1', { count: 2 }))).toBe(0);
	});

	it('opens a new row for a call it has not seen', () => {
		expect(matchToolActivity([], runningTool())).toBeUndefined();
	});

	// Falling back on an id that matches nothing would fold a second parked approval
	// onto the first and lose it.
	it('keeps a second parked call apart from the first', () => {
		const parked: ChatToolActivity = { ...runningTool('call-1'), status: 'approval_required' };
		const second: ChatToolActivity = {
			callId: 'call-2',
			name: 'archive_note',
			arguments: {},
			status: 'approval_required'
		};
		expect(matchToolActivity([parked], second)).toBeUndefined();
	});

	// Some providers report an outcome with no id at all.
	it('settles an id-less completion onto the only call still active', () => {
		expect(matchToolActivity([runningTool()], completed('', { count: 2 }))).toBe(0);
	});
});

describe('Merging a tool event into its row', () => {
	it('takes the outcome from the event', () => {
		expect(mergeToolActivity(runningTool(), completed('call-1', { count: 2 }))).toEqual({
			callId: 'call-1',
			name: 'find_references',
			arguments: { query: 'agent skills' },
			output: { count: 2 },
			status: 'succeeded'
		});
	});

	// A completion arrives with empty arguments, and the arguments are the only
	// record of what was called.
	it('keeps the arguments the event does not restate', () => {
		expect(mergeToolActivity(runningTool(), completed('call-1', {})).arguments).toEqual({
			query: 'agent skills'
		});
	});

	// The row moves to an arm with nowhere to keep one, which is the point: a call
	// running again has not produced anything yet.
	it('drops the output of an attempt when the call runs again', () => {
		const settled = completed('call-1', { count: 2 });
		expect(mergeToolActivity(settled, runningTool())).not.toHaveProperty('output');
	});

	it('takes the id from an event that carries one', () => {
		expect(mergeToolActivity(runningTool(), completed('', {})).callId).toBe('call-1');
	});
});

/**
 * `edit_note` returns `{ failure, problems }` as a value rather than throwing, and that is
 * deliberate: a throw is stringified to a bare message and strips the occurrence counts and
 * nearest matches the model needs to correct itself on the next turn (ADR 0035).
 *
 * The run used to journal that call `succeeded`, so reading only `status === 'failed'` meant
 * nothing downstream ever saw it. A no-op edit rendered "Edited note · <title>" in ordinary
 * colour and the turn's summary claimed the verb `edited` — a failure that looked exactly
 * like a success, which is the one thing ADR 0015 exists to forbid. The classification now
 * happens where the value is produced, and the row arrives in the arm that says so.
 */
describe('A failure a tool returned as a value is still a failure', () => {
	const noOpEdit: ChatToolActivity = {
		callId: 'call-9',
		name: 'edit_note',
		arguments: { noteId: 'note-1' },
		status: 'reported_failure',
		failure: 'No edits were applied.',
		output: { failure: 'No edits were applied.', problems: ['Edit 1: oldText was not found.'] }
	};

	it('reads the failure off the arm that carries it', () => {
		expect(toolFailure(noOpEdit)).toBe('No edits were applied.');
	});

	it('keeps the detail the failure was read out of, which is what the model was given', () => {
		expect(toolOutput(noOpEdit)).toEqual({
			failure: 'No edits were applied.',
			problems: ['Edit 1: oldText was not found.']
		});
	});

	it('still reports nothing for a call that genuinely succeeded', () => {
		expect(toolFailure(completed('call-1', { noteId: 'note-1' }))).toBeUndefined();
	});
});

describe('Reading a journalled tool row back into the transcript', () => {
	const row = (content: Record<string, AgentPayload>) =>
		readJournalledTool(content, { runId: 'run-1' });

	it('restores a succeeded call with the result it returned', () => {
		expect(
			row({
				type: 'tool_activity',
				callId: 'call-1',
				name: 'save_note',
				input: { noteId: 'note-1' },
				output: { noteId: 'note-1' },
				failure: null,
				status: 'succeeded'
			})
		).toEqual({
			kind: 'readable',
			tool: {
				callId: 'call-1',
				name: 'save_note',
				arguments: { noteId: 'note-1' },
				runId: 'run-1',
				output: { noteId: 'note-1' },
				status: 'succeeded'
			}
		});
	});

	it('restores a reported failure with both the message and its detail', () => {
		expect(
			row({
				type: 'tool_activity',
				callId: 'call-9',
				name: 'edit_note',
				input: {},
				output: { failure: 'No edits were applied.' },
				failure: 'No edits were applied.',
				status: 'reported_failure'
			})
		).toEqual({
			kind: 'readable',
			tool: {
				callId: 'call-9',
				name: 'edit_note',
				arguments: {},
				runId: 'run-1',
				failure: 'No edits were applied.',
				output: { failure: 'No edits were applied.' },
				status: 'reported_failure'
			}
		});
	});

	/**
	 * The absence is load-bearing: `matchToolActivity` settles an id-less outcome by
	 * name and recency, and it can only do that if the row does not spell the missing
	 * id `''`. This read used to be `String(content.callId ?? '')`.
	 */
	it('leaves an id the row does not carry absent rather than spelling it empty', () => {
		const read = row({
			type: 'tool_activity',
			callId: null,
			name: 'search',
			input: {},
			output: null,
			failure: null,
			status: 'succeeded'
		});
		expect(read.kind === 'readable' && 'callId' in read.tool).toBe(false);
	});

	it('refuses a status no arm of the union has, rather than minting one', () => {
		expect(row({ type: 'tool_activity', name: 'search', input: {}, status: 'nearly' }).kind).toBe(
			'unreadable'
		);
	});

	it('refuses a settled row that says it failed without saying how', () => {
		expect(
			row({ type: 'tool_activity', name: 'search', input: {}, failure: null, status: 'failed' })
				.kind
		).toBe('unreadable');
	});
});

describe('Reading the arguments a call was made with', () => {
	it('keeps an object of arguments as they are', () => {
		expect(toolArguments({ query: 'skills' })).toEqual({ query: 'skills' });
	});

	it('records no arguments when the payload is not an object', () => {
		expect(toolArguments(['skills'])).toEqual({});
	});
});
