import { describe, expect, it } from 'vitest';
import {
	matchToolActivity,
	mergeToolActivity,
	toolFailure,
	type ChatToolActivity
} from './chat-tools';

const runningTool = (callId = 'call-1'): ChatToolActivity => ({
	callId,
	name: 'find_references',
	arguments: { query: 'agent skills' },
	status: 'running'
});

const completed = (callId: string, output: unknown): ChatToolActivity => ({
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
 * nearest matches the model needs to correct itself on the next turn (ADR 0035). The run
 * journals the call `succeeded` all the same.
 *
 * Reading only `status === 'failed'` meant nothing downstream ever saw it. A no-op edit
 * rendered "Edited note · <title>" in ordinary colour and the turn's summary claimed the
 * verb `edited` — a failure that looked exactly like a success, which is the one thing
 * ADR 0015 exists to forbid. The server contract does not move; the question moves.
 */
describe('A failure a tool returned as a value is still a failure', () => {
	const noOpEdit: ChatToolActivity = {
		callId: 'call-9',
		name: 'edit_note',
		arguments: { noteId: 'note-1' },
		status: 'succeeded',
		output: { failure: 'No edits were applied.', problems: ['Edit 1: oldText was not found.'] }
	};

	it('reads the failure the call carried in its result', () => {
		expect(toolFailure(noOpEdit)).toBe('No edits were applied.');
	});

	it('still reports nothing for a call that genuinely succeeded', () => {
		expect(toolFailure(completed('call-1', { noteId: 'note-1' }))).toBeUndefined();
	});

	it('ignores a non-string failure key rather than showing an object', () => {
		expect(toolFailure({ ...noOpEdit, output: { failure: { code: 7 } } })).toBeUndefined();
	});

	it('ignores an empty failure key, which says nothing', () => {
		expect(toolFailure({ ...noOpEdit, output: { failure: '  ' } })).toBeUndefined();
	});
});
