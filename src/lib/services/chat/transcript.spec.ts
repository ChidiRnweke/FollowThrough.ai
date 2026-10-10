import type { MutableChatPart, ChatToolActivity } from '$lib/models/chat';
import { describe, expect, it } from 'vitest';
import type { AgentPayload } from '$lib/models/agent/payload';
import { ChatTranscriptService } from './transcript';

const chatPresentation = new ChatTranscriptService();

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

const project = (
	tools: readonly ChatToolActivity[],
	incoming: ChatToolActivity
): ChatToolActivity[] => {
	const parts: MutableChatPart[] = tools.map((tool) => ({ kind: 'tool', tool }));
	chatPresentation.applyTool(parts, incoming);
	return parts.flatMap((part) => (part.kind === 'tool' ? [part.tool] : []));
};
const merge = (existing: ChatToolActivity, incoming: ChatToolActivity): ChatToolActivity =>
	project([existing], incoming)[0]!;
describe('Applying tool events to a transcript', () => {
	it('settles the row with the matching call id', () => {
		expect(project([runningTool()], completed('call-1', { count: 2 }))).toMatchObject([
			{ callId: 'call-1', status: 'succeeded' }
		]);
	});
	it('adds a new row for a new call', () => {
		expect(project([], runningTool())).toEqual([runningTool()]);
	});
	it('keeps separate parked calls in separate rows', () => {
		const first: ChatToolActivity = { ...runningTool('call-1'), status: 'approval_required' };
		const second: ChatToolActivity = { ...runningTool('call-2'), status: 'approval_required' };
		expect(project([first], second)).toEqual([first, second]);
	});
	it('settles an id-less outcome onto the only active call', () => {
		expect(project([runningTool()], completed('', { count: 2 }))).toMatchObject([
			{ callId: 'call-1', status: 'succeeded' }
		]);
	});
});

describe('Merging a tool event into its row', () => {
	it('takes the outcome from the event', () => {
		expect(merge(runningTool(), completed('call-1', { count: 2 }))).toEqual({
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
		expect(merge(runningTool(), completed('call-1', {})).arguments).toEqual({
			query: 'agent skills'
		});
	});

	// The row moves to an arm with nowhere to keep one, which is the point: a call
	// running again has not produced anything yet.
	it('drops the output of an attempt when the call runs again', () => {
		const settled = completed('call-1', { count: 2 });
		expect(merge(settled, runningTool())).not.toHaveProperty('output');
	});

	it('takes the id from an event that carries one', () => {
		expect(merge(runningTool(), completed('', {})).callId).toBe('call-1');
	});
});

/**
 * `edit_note` returns `{ kind: 'failure', code, message, recovery, details }` as a value rather than throwing, and that is
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
		output: {
			kind: 'failure',
			code: 'NOTE_REVIEW_FAILED',
			message: 'No edits were applied.',
			recovery: 'Correct the problems below and submit a new tool call.',
			details: { problems: ['Edit 1: oldText was not found.'] }
		}
	};

	it('reads a failed tool call and preserves its model-facing failure detail', () => {
		expect({
			failure: chatPresentation.toolFailure(noOpEdit),
			output: chatPresentation.toolOutput(noOpEdit)
		}).toEqual({
			failure: 'No edits were applied.',
			output: {
				kind: 'failure',
				code: 'NOTE_REVIEW_FAILED',
				message: 'No edits were applied.',
				recovery: 'Correct the problems below and submit a new tool call.',
				details: { problems: ['Edit 1: oldText was not found.'] }
			}
		});
	});

	it('still reports nothing for a call that genuinely succeeded', () => {
		expect(chatPresentation.toolFailure(completed('call-1', { noteId: 'note-1' }))).toBeUndefined();
	});
});
