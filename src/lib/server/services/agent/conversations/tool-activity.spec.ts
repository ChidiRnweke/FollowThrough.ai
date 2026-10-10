import { toolFailure } from '$lib/models/agent/tool-failure';
import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentRunId, ToolOutcomeEvent } from '$lib/models/agent';
import { noteReviewBuilder } from '$lib/testing/notes/fixtures/note-review';
import { ToolActivityProjectionService } from './tool-activity';

const projection = new ToolActivityProjectionService();
const runId = '30000000-0000-4000-8000-000000000001' as AgentRunId;

const outcomes: readonly ToolOutcomeEvent[] = [
	{ type: 'tool_succeeded', name: 'get_note' },
	{ type: 'tool_succeeded', callId: 'read', name: 'get_note', output: null },
	{
		type: 'tool_reported_failure',
		name: 'edit_note',
		failure: 'No edits',
		output: toolFailure('VALIDATION', 'No edits', 'Read the note.', { problems: 1 })
	},
	{
		type: 'tool_reported_failure',
		callId: 'edit',
		name: 'edit_note',
		failure: 'No edits',
		output: toolFailure('VALIDATION', 'No edits', 'Read the note.', { problems: 1 })
	},
	{ type: 'tool_failed', name: 'get_note', failure: 'Disconnected' },
	{ type: 'tool_failed', callId: 'read', name: 'get_note', failure: 'Disconnected' }
];
const nonOutcomes: readonly AgentEvent[] = [
	{ type: 'tool_started', callId: 'read', name: 'get_note', arguments: { noteId: 'note-1' } },
	{ type: 'approval_required', runId, callId: 'edit', name: 'edit_note', arguments: {} },
	{ type: 'text_delta', text: 'Done.' },
	{ type: 'run_started', runId, attempt: 1 }
];

describe('tool outcome classification', () => {
	it.each(outcomes)('retains the exact resolved $type event ($callId)', (event) => {
		expect(projection.outcome(event)).toBe(event);
	});
	it.each(nonOutcomes)('does not settle a call for $type', (event) => {
		expect(projection.outcome(event)).toBeUndefined();
	});
});

describe('tool activity projection', () => {
	it('opens the call with its identifier and original arguments', () => {
		expect(
			projection.activity({
				type: 'tool_started',
				callId: 'read',
				name: 'get_note',
				arguments: { noteId: 'note-1' }
			})
		).toStrictEqual({
			callId: 'read',
			name: 'get_note',
			input: { noteId: 'note-1' },
			status: 'running'
		});
	});
	it('retains the exact saved approval review', () => {
		const review = { kind: 'note_change' as const, content: JSON.stringify(noteReviewBuilder()) };
		expect(
			projection.activity({
				type: 'approval_required',
				runId,
				callId: 'edit',
				name: 'edit_note',
				arguments: { noteId: 'note-1' },
				review
			})
		).toStrictEqual({
			callId: 'edit',
			name: 'edit_note',
			input: { noteId: 'note-1' },
			status: 'approval_required',
			review
		});
	});
	it('does not invent an approval review', () => {
		expect(
			projection.activity({
				type: 'approval_required',
				runId,
				callId: 'archive',
				name: 'archive_note',
				arguments: {}
			})
		).toStrictEqual({
			callId: 'archive',
			name: 'archive_note',
			input: {},
			status: 'approval_required'
		});
	});
	it('preserves success with neither identifier nor output', () => {
		expect(projection.activity({ type: 'tool_succeeded', name: 'get_note' })).toStrictEqual({
			name: 'get_note',
			input: {},
			status: 'succeeded'
		});
	});
	it.each([null, false, 0, '', {}, []])('retains an explicit success payload %j', (output) => {
		expect(
			projection.activity({ type: 'tool_succeeded', callId: 'read', name: 'get_note', output })
		).toStrictEqual({ callId: 'read', name: 'get_note', input: {}, status: 'succeeded', output });
	});
	it.each([{}, { callId: 'edit' }])(
		'keeps reported failure detail with identity %j',
		(identity) => {
			expect(
				projection.activity({
					type: 'tool_reported_failure',
					...identity,
					name: 'edit_note',
					failure: 'No edits',
					output: toolFailure('VALIDATION', 'No edits', 'Read the note.', { problems: 1 })
				})
			).toStrictEqual({
				...identity,
				name: 'edit_note',
				input: {},
				failure: 'No edits',
				output: toolFailure('VALIDATION', 'No edits', 'Read the note.', { problems: 1 }),
				status: 'reported_failure'
			});
		}
	);
	it.each([{}, { callId: 'read' }])(
		'keeps execution failure without an output with identity %j',
		(identity) => {
			expect(
				projection.activity({
					type: 'tool_failed',
					...identity,
					name: 'get_note',
					failure: 'Disconnected'
				})
			).toStrictEqual({
				...identity,
				name: 'get_note',
				input: {},
				failure: 'Disconnected',
				status: 'failed'
			});
		}
	);
	it('has no row for an unrelated event', () => {
		expect(projection.activity({ type: 'text_delta', text: 'Done.' })).toBeUndefined();
	});
});
