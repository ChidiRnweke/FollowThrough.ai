import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentRunId } from '$lib/models/agent';
import { readAgentEvent, readAgentRunEventRecord, toolActivityFromEvent } from '$lib/models/agent';

const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;

const read = (event: unknown) => readAgentEvent(event);

/**
 * `agent_run_events.event` is declared `jsonb('event').$type<AgentEvent>()`, which
 * is the writer's promise about rows the writer has not seen. Every row in the
 * table predates at least one change to this union, and until now the replay
 * handed them all straight out under a type nothing had checked.
 */
describe('Reading a stored run event', () => {
	it('reads a modelled event back as itself', () => {
		const event: AgentEvent = { type: 'text_delta', text: 'Reading it first.' };
		expect(read(event)).toEqual({ kind: 'readable', event });
	});

	it('says a row is unreadable rather than throwing the whole replay away', () => {
		expect(read({ type: 'tool_completed', name: 'save_note' }).kind).toBe('unreadable');
	});

	it('names what it could not read, because the warning has to say something', () => {
		const result = read({ type: 'text_delta' });
		expect(result.kind === 'unreadable' && result.reason.length > 0).toBe(true);
	});

	it('refuses a tool result that is not JSON the wire can carry', () => {
		expect(
			read({ type: 'tool_succeeded', name: 'save_note', output: { writtenAt: new Date() } }).kind
		).toBe('unreadable');
	});
});

/**
 * Three arms because there are three facts. As one arm with `output?` beside
 * `failure?` a settled row could say it succeeded and carry a failure, or say it
 * failed and carry nothing — and 30 of the 147 rows the run had stored carried
 * both, which both readers answered by dropping the output.
 */
describe('The three ways a call settles', () => {
	it('keeps a result on the succeeded arm', () => {
		const event: AgentEvent = {
			type: 'tool_succeeded',
			callId: 'call-1',
			name: 'find_references',
			output: { count: 2 }
		};
		expect(read(event)).toEqual({ kind: 'readable', event });
	});

	it('keeps both the message and its detail on the reported-failure arm', () => {
		const event: AgentEvent = {
			type: 'tool_reported_failure',
			callId: 'call-9',
			name: 'edit_note',
			failure: 'No edits were applied.',
			output: { failure: 'No edits were applied.', problems: ['oldText was not found.'] }
		};
		expect(read(event)).toEqual({ kind: 'readable', event });
	});

	it('refuses a reported failure with no value to have read it out of', () => {
		expect(
			read({ type: 'tool_reported_failure', name: 'edit_note', failure: 'No edits.' }).kind
		).toBe('unreadable');
	});

	it('refuses a failed call that will not say what went wrong', () => {
		expect(read({ type: 'tool_failed', name: 'edit_note' }).kind).toBe('unreadable');
	});

	/**
	 * Absence is load-bearing: the client settles an id-less outcome by name and
	 * recency, which it can only do if the server says the id is missing rather
	 * than spelling it `''`.
	 */
	it('keeps a missing call id missing', () => {
		const result = read({ type: 'tool_succeeded', name: 'read_note' });
		expect(result.kind === 'readable' && 'callId' in result.event).toBe(false);
	});
});

describe('Turning an event into the journal row it calls for', () => {
	it('journals a reported failure with the value the failure was read out of', () => {
		expect(
			toolActivityFromEvent({
				type: 'tool_reported_failure',
				callId: 'call-9',
				name: 'edit_note',
				failure: 'No edits were applied.',
				output: { problems: 1 }
			})
		).toEqual({
			callId: 'call-9',
			name: 'edit_note',
			input: {},
			failure: 'No edits were applied.',
			output: { problems: 1 },
			status: 'reported_failure'
		});
	});

	it('has no row for an event that is not about a tool call', () => {
		expect(toolActivityFromEvent({ type: 'text_delta', text: 'Done.' })).toBeUndefined();
	});
});

/**
 * The stream frame is text off a socket, and the two ends are versioned
 * separately — a tab left open across a deploy reads the new stream with the old
 * union, or the reverse. It used to be one assertion covering the whole record,
 * with the `createdAt` string quietly retyped as a `Date`.
 */
describe('Reading one frame off the run event stream', () => {
	const frame = {
		cursor: '12',
		runId,
		attempt: 1,
		event: { type: 'text_delta', text: 'Found two.' },
		createdAt: '2026-08-31T10:00:00.000Z'
	};

	it('turns the serialized timestamp back into a date', () => {
		const result = readAgentRunEventRecord(frame);
		expect(result.kind === 'readable' && result.createdAt.toISOString()).toBe(
			'2026-08-31T10:00:00.000Z'
		);
	});

	it('reads the event the frame carries', () => {
		const result = readAgentRunEventRecord(frame);
		expect(result.kind === 'readable' && result.event).toEqual({
			type: 'text_delta',
			text: 'Found two.'
		});
	});

	it('drops a frame whose event this client does not model', () => {
		expect(readAgentRunEventRecord({ ...frame, event: { type: 'tool_completed' } }).kind).toBe(
			'unreadable'
		);
	});

	it('drops a frame with no timestamp rather than inventing one', () => {
		const { createdAt: _omitted, ...withoutTimestamp } = frame;
		expect(readAgentRunEventRecord(withoutTimestamp).kind).toBe('unreadable');
	});
});
