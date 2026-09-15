import { describe, expect, it } from 'vitest';
import { readAgentRunEventRecord } from './event-reader';
const runId = '00000000-0000-4000-8000-000000000001';

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

	it.each(['', '-1', '1.5', 'NaN', 'abc'])('rejects invalid frame cursor %s', (cursor) => {
		expect(readAgentRunEventRecord({ ...frame, cursor }).kind).toBe('invalid');
	});

	it('preserves the identity and reason of an unreadable saved event', () => {
		const { event: _event, ...identity } = frame;
		expect(
			readAgentRunEventRecord({ ...identity, kind: 'unreadable', reason: 'Unknown event' })
		).toEqual({
			...identity,
			createdAt: new Date(identity.createdAt),
			kind: 'unreadable',
			reason: 'Unknown event'
		});
	});

	it('retains the cursor when a newer server sends an unknown event', () => {
		expect(readAgentRunEventRecord({ ...frame, event: { type: 'future_event' } })).toMatchObject({
			kind: 'unreadable',
			cursor: '12',
			runId,
			attempt: 1
		});
	});

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

	it('keeps a cursor for an event this client does not model', () => {
		expect(readAgentRunEventRecord({ ...frame, event: { type: 'tool_completed' } }).kind).toBe(
			'unreadable'
		);
	});

	it('rejects a frame with no timestamp rather than inventing one', () => {
		const { createdAt: _omitted, ...withoutTimestamp } = frame;
		expect(readAgentRunEventRecord(withoutTimestamp).kind).toBe('invalid');
	});
});
